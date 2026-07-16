(function($) {
    "use strict";

    if (typeof $ === "undefined") return;

    var STATUS_LABELS = {
        10: {label: "Queued", cls: "QUEUED"},
        20: {label: "Running", cls: "RUNNING"},
        30: {label: "Failed", cls: "FAILED"},
        40: {label: "Completed", cls: "COMPLETED"},
        50: {label: "Canceled", cls: "CANCELED"}
    };

    function statusInfo(task) {
        if (task.status === null || task.status === undefined) {
            return {label: "Uploading", cls: "QUEUED"};
        }
        return STATUS_LABELS[task.status] || {label: "Unknown", cls: ""};
    }

    function formatSize(mb) {
        mb = mb || 0;
        if (mb < 1) return Math.round(mb * 1024) + " KB";
        if (mb < 1024) return mb.toFixed(1) + " MB";
        return (mb / 1024).toFixed(2) + " GB";
    }

    function escapeHtml(str) {
        return $("<div>").text(str === null || str === undefined ? "" : str).html();
    }

    function TaskManager(root) {
        this.$root = root;
        this.$tbody = root.find("#tm-tbody");
        this.$table = root.find("#tm-table");
        this.$loading = root.find("#tm-loading");
        this.$error = root.find("#tm-error");
        this.$total = root.find("#tm-total-value");

        this._bindEvents();
        this.load();
    }

    TaskManager.prototype._bindEvents = function() {
        var self = this;

        this.$root.find("#tm-refresh").on("click", function() {
            self.load();
        });

        this.$tbody.on("click", ".tm-compact", function() {
            var $btn = $(this);
            var msg = "Compacting will free disk space by permanently deleting the original images " +
                "and intermediate files used for processing. It will no longer be possible to " +
                "restart this task. Maps and models will remain in place. Continue?";
            if (!window.confirm(msg)) return;
            self._runAction("compact", $btn);
        });

        this.$tbody.on("click", ".tm-delete", function() {
            var $btn = $(this);
            var msg = "All information related to this task, including images, maps and " +
                "models, will be permanently deleted. Continue?";
            if (!window.confirm(msg)) return;
            self._runAction("remove", $btn);
        });
    };

    TaskManager.prototype._runAction = function(action, $btn) {
        var self = this;
        var projectId = $btn.data("project");
        var taskId = $btn.data("task");

        $btn.prop("disabled", true).find("i").addClass("fa-spin");

        $.ajax({
            url: "/api/projects/" + projectId + "/tasks/" + taskId + "/" + action + "/",
            type: "POST"
        }).done(function(res) {
            if (res && res.error) {
                window.alert(res.error);
                $btn.prop("disabled", false);
            } else {
                self.load();
            }
        }).fail(function(xhr) {
            var msg = "An error occurred while performing the action.";
            try {
                var res = JSON.parse(xhr.responseText);
                if (res && res.error) msg = res.error;
                else if (res && res.detail) msg = res.detail;
            } catch (e) { /* ignore */ }
            window.alert(msg);
            $btn.prop("disabled", false);
        });
    };

    TaskManager.prototype._setLoading = function(loading) {
        this.$loading.toggle(loading);
        this.$table.toggle(!loading);
    };

    TaskManager.prototype._rowHtml = function(project, task, ownerName) {
        var perms = project.permissions || [];
        var canDelete = perms.indexOf("delete") !== -1;
        var isCompacted = !!task.compacted;
        var canCompact = canDelete && task.status === 40 && !isCompacted;
        var st = statusInfo(task);

        var actions = "";
        if (isCompacted) {
            actions += '<button type="button" class="btn btn-xs tm-compacted-state" disabled ' +
                'title="Compacted"><i class="fa fa-check"></i> Compacted</button>';
        } else if (canCompact) {
            actions += '<button type="button" class="btn btn-xs btn-default tm-compact" ' +
                'data-project="' + project.id + '" data-task="' + task.id + '" ' +
                'title="Compact"><i class="fa fa-database"></i> Compact</button>';
        }
        if (canDelete) {
            actions += '<button type="button" class="btn btn-xs btn-danger tm-delete" ' +
                'data-project="' + project.id + '" data-task="' + task.id + '" ' +
                'title="Delete"><i class="fa fa-trash"></i> Delete</button>';
        }
        if (actions === "") actions = '<span class="text-muted">&mdash;</span>';

        return '<tr>' +
            '<td class="tm-project-name">' + escapeHtml(project.name) + '</td>' +
            '<td>' + escapeHtml(ownerName || "") + '</td>' +
            '<td>' + escapeHtml(task.name || task.id) + '</td>' +
            '<td class="tm-status-' + st.cls + '">' + escapeHtml(st.label) + '</td>' +
            '<td>' + (task.images_count || 0) + '</td>' +
            '<td>' + formatSize(task.size) + '</td>' +
            '<td class="tm-actions">' + actions + '</td>' +
            '</tr>';
    };

    TaskManager.prototype._render = function(entries, owners) {
        var self = this;
        var html = "";
        var total = 0;
        owners = owners || {};

        entries.sort(function(a, b) {
            return (a.project.name || "").localeCompare(b.project.name || "");
        });

        entries.forEach(function(entry) {
            entry.tasks.sort(function(a, b) {
                return new Date(b.created_at) - new Date(a.created_at);
            });
            entry.tasks.forEach(function(task) {
                total += task.size || 0;
                html += self._rowHtml(entry.project, task, owners[entry.project.id]);
            });
        });

        if (html === "") {
            html = '<tr><td colspan="7" class="text-center text-muted">No tasks found.</td></tr>';
        }

        this.$tbody.html(html);
        this.$total.text(formatSize(total));
    };

    TaskManager.prototype.load = function() {
        var self = this;

        this._setLoading(true);
        this.$error.hide();

        var owners = {};
        var ownersRequest = $.getJSON("owners").done(function(res) {
            owners = res || {};
        });

        $.getJSON("/api/projects/?ordering=name").done(function(projects) {
            var entries = [];
            var requests = projects.map(function(project) {
                return $.getJSON("/api/projects/" + project.id + "/tasks/").done(function(tasks) {
                    entries.push({project: project, tasks: tasks});
                });
            });
            requests.push(ownersRequest);

            $.when.apply($, requests).always(function() {
                self._render(entries, owners);
                self._setLoading(false);
            });

            if (requests.length === 0) {
                self._render(entries, owners);
                self._setLoading(false);
            }
        }).fail(function() {
            self.$error.text("Unable to retrieve the list of projects.").show();
            self._setLoading(false);
        });
    };

    $(function() {
        var $root = $(".task-manager-plugin");
        if ($root.length === 0) return; // Not on the plugin's page

        new TaskManager($root);
    });

})(window.jQuery);
