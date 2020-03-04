from orun.addons import Addon
from orun.contrib.staticfiles.checks import check_finders
from orun.core import checks
from orun.utils.translation import gettext_lazy as _


class StaticFilesConfig(Addon):
    name = 'orun.contrib.staticfiles'
    verbose_name = _("Static Files")
    ignore_patterns = ['CVS', '.*', '*~']

    def ready(self):
        checks.register(check_finders, 'staticfiles')
