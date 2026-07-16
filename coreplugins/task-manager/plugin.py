from app.plugins import PluginBase, Menu, MountPoint
from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.utils.translation import gettext as _
from guardian.shortcuts import get_objects_for_user

from app.models import Project


class Plugin(PluginBase):
    def main_menu(self):
        return [Menu(_("Task Manager"), self.public_url(""), "fa fa-hdd fa-fw")]

    def app_mount_points(self):
        @login_required
        def index_view(request):
            return render(request, self.template_path("index.html"), {
                'title': _("Task Manager")
            })

        @login_required
        def owners_view(request):
            projects = get_objects_for_user(request.user, 'view_project', Project,
                                             accept_global_perms=False).select_related('owner')
            owners = {}
            for project in projects:
                owners[project.id] = project.owner.get_full_name() or project.owner.username
            return JsonResponse(owners)

        return [
            MountPoint('$', index_view),
            MountPoint('owners$', owners_view),
            # more mount points here ...
        ]

    def include_js_files(self):
        return ['main.js']

    def include_css_files(self):
        return ['style.css']

