import os
import re
from jinja2 import Environment, FunctionLoader

from orun import g
from orun.apps import apps
from orun.shortcuts import render
from orun.template import loader, Template
from orun.conf import settings
from orun.db import models
from orun.utils.translation import gettext, gettext_lazy as _
from orun.utils.xml import etree


def get_template(self, template):
    # TODO try to find on db (if not found, try to search on file system)
    app_label = template.split('/', 1)[0]
    addon = apps.addons[app_label]
    f = os.path.join(addon.root_path, addon.template_folder, template)
    if os.path.isfile(f):
        with open(f, encoding='utf-8') as tmpl:
            return tmpl.read()


views_env = Environment()


class View(models.Model):
    name = models.CharField(max_length=100)
    active = models.BooleanField(label=_('Active'), default=True)
    parent = models.ForeignKey('self')
    view_type = models.ChoiceField(
        (
            ('list', 'List'),
            ('form', 'Form'),
            ('card', 'Card'),
            ('chart', 'Chart'),
            ('calendar', 'Calendar'),
            ('search', 'Search'),
            ('template', 'Template'),
            ('report', 'Report'),
            ('dashboard', 'Dashboard'),
            ('custom', 'Custom'),
        ), null=False
    )
    mode = models.CharField(16, choices=(
        ('primary', _('Primary')),
        ('extension', _('Extension'))
    ), default='primary', null=False)
    model = models.CharField(128, db_index=True)
    priority = models.IntegerField(_('Priority'), default=99, null=False)
    template_name = models.CharField(max_length=255)
    content = models.XmlField(caption=_('Content'))
    ref_id = models.CharField(caption=_('Reference ID'), getter='_get_xml_id')
    children = models.OneToManyField('self', 'parent')

    class Meta:
        name = 'ui.view'
        ordering = ('name', 'priority')

    def save(self, *args, **kwargs):
        if self.parent_id and self.mode is None:
            self.mode = 'extension'
        if self.view_type is None:
            xml = etree.fromstring(self.render({}))
            self.view_type = xml.tag
        super(View, self).save(*args, **kwargs)

    def _get_xml_id(self):
        obj = self.env['ir.object'].get_by_object_id(self._meta.name, self.id)
        if obj:
            return obj.name

    def get_content(self, model):
        xml = etree.tostring(self.get_xml(model))
        return xml

    def get_xml(self, model):
        context = {'opts': model._meta if model else None}
        return self.compile(context)

    def xpath(self, source, element):
        pos = element.attrib.get('position')
        expr = element.attrib.get('expr')
        target = source
        if expr:
            target = target.xpath(expr)[0]
        if pos == 'append':
            for child in element:
                target.append(etree.fromstring(etree.tostring(child)))
        elif pos == 'insert':
            for child in reversed(element):
                target.insert(0, etree.fromstring(etree.tostring(child)))
        elif pos == 'before':
            parent = target.getparent()
            idx = parent.index(target)
            for child in reversed(element):
                parent.insert(idx, etree.fromstring(etree.tostring(child)))
        elif pos == 'after':
            parent = target.getparent()
            idx = parent.index(target) + 1
            for child in reversed(element):
                parent.insert(idx, etree.fromstring(etree.tostring(child)))
        elif pos == 'attributes':
            for child in element:
                target.attrib[child.attrib['name']] = child.text
        elif pos == 'replace':
            p = target.getparent()
            idx = p.index(target)
            p.remove(target)
            for child in element:
                p.insert(idx, etree.fromstring(etree.tostring(child)))

    def merge(self, source, dest):
        for child in dest:
            if child.tag == 'xpath':
                self.xpath(source, child)
        for k, v in dest.attrib.items():
            source.attrib[k] = v

    def compile(self, context, parent=None):
        view_cls = self.__class__
        children = view_cls.objects.filter(parent_id=self.pk, mode='extension')
        xml = etree.fromstring(self._get_content(context))
        if self.parent and self.mode == 'primary':
            parent_xml = etree.fromstring(self.parent.render(context))
            self.merge(parent_xml, xml)
            xml = parent_xml

        for child in children:
            self.merge(xml, etree.fromstring(child._get_content(context)))

        self._eval_permissions(xml)
        return xml

    def _eval_permissions(self, xml):
        _groups = {}
        return
        user = self.env.user
        if not user.is_superuser:
            objects = self.env['ir.object']
            children = xml.xpath("//*[@groups]")
            for child in children:
                groups = child.attrib['groups']
                if groups not in _groups:
                    has_groups = len(list(objects.objects.only('id').filter(
                        objects.c.model == 'auth.group', objects.c.name.in_(groups.split(',')),
                        objects.c.object_id.in_(user.groups)
                    )[:1])) > 0
                    _groups[groups] = has_groups
                if not _groups[groups]:
                    child.getparent().remove(child)

    def _get_content(self, context):
        if self.view_type == 'report':
            from orun.contrib.erp.models.reports import report_env
            templ = loader.get_template(self.template_name.split(':')[-1])
        else:
            templ = apps.jinja_env.get_or_select_template(self.template_name.split(':')[-1])
            return templ.render(context)
        res = open(templ.template.filename, encoding='utf-8').read()
        return res

    def to_string(self):
        templ = apps.jinja_env.get_or_select_template(self.template_name.split(':')[-1])
        with open(templ.filename, encoding='utf-8') as f:
            return f.read()

    def render(self, context):
        context['_'] = gettext
        if self.view_type in ('dashboard', 'report'):
            context['db'] = {
                'session': session
            }
        if settings.DEBUG and self.template_name:
            # context['ref'] = g.env.ref
            templ = self.template_name.split(':')[-1]
            if self.view_type in ('dashboard', 'report'):
                return apps.report_env.get_or_select_template(templ).render(**context)
            return loader.get_template(templ).render(context)
        if self.view_type in ('dashboard', 'report'):
            return apps.report_env.from_string(self.content).render(**context)
        return Template(self.content).render(context)

    @classmethod
    def generate_view(self, request, model, view_type='form'):
        opts = model._meta
        return render_template(
            request,
            [
                'views/%s/%s.html' % (opts.name, view_type),
                'views/%s/%s.xml' % (opts.name, view_type),
                'views/%s/%s.xml' % (opts.app_label, view_type),
                'views/%s.xml' % view_type,
            ], context=dict(opts=opts, _=gettext)
        )

    @classmethod
    def render_template(self, request, template, context):
        # find template by ref id
        templ = apps['ir.object'].get_by_natural_key(template).object
        children = list(self.objects.filter(mode='primary', parent=templ.id))
        if children:
            for child in children:
                print(child)
        else:
            views_env.from_string


class CustomView(models.Model):
    user = models.ForeignKey('auth.user', null=False)
    view = models.ForeignKey(View, null=False)
    content = models.TextField()

    class Meta:
        name = 'ui.view.custom'


class Filter(models.Model):
    name = models.CharField(256, null=False, verbose_name=_('Name'))
    user = models.ForeignKey('auth.user', on_delete=models.CASCADE)
    domain = models.TextField()
    context = models.TextField()
    sort = models.TextField()
    params = models.TextField()
    is_default = models.BooleanField(default=False)
    is_shared = models.BooleanField(default=True)
    action = models.ForeignKey('ir.action', verbose_name=_('Action'))
    # query = models.ForeignKey('ir.query')
    active = models.BooleanField(default=True)

    class Meta:
        name = 'ui.filter'
