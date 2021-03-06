from orun.apps import apps


def get_current_site(request):
    """
    Check if contrib.sites is installed and return either the current
    ``Site`` object or a ``RequestSite`` object based on the request.
    """
    # Imports are inside the function because its point is to avoid importing
    # the Site models when orun.contrib.sites isn't installed.
    if apps.is_installed('orun.contrib.sites'):
        from .models import Site
        return apps[Site].objects.get_current(request)
    else:
        from .requests import RequestSite
        return RequestSite(request)
