"""
A XML Deserializer. Shortcut to deserialize complex structured Xml files.
"""
import functools
import os
from xml.etree import ElementTree as etree

from orun.core.exceptions import ObjectDoesNotExist
from orun.core.serializers import base
from orun.db import models
from orun.utils.translation import gettext as _
from orun.apps import apps

Object = apps['ir.object']
ContentType = apps['ir.model']


def ref(xml_id):
    return Object.objects.get_object(xml_id).object_id


class Serializer(base.Serializer):
    pass


class Deserializer(base.Deserializer):
    def deserialize(self):
        data = self.stream.read()
        if not isinstance(data, (bytes, str)):
            data = etree.parse(data).getroot()
        elif isinstance(data, bytes):
            data = etree.fromstring(data)
        else:
            data = etree.fromstring(data)
        lst = []
        trans = data.attrib.get('translate')
        for el in data:
            obj = self.TAGS[el.tag](self, el, translate=trans)
            if isinstance(obj, list):
                lst.extend(obj)
            elif obj:
                lst.append(obj)
        return lst

    def read_object(self, obj, trans=False, **attrs):
        if not isinstance(obj, dict):
            values = obj.getchildren()
            obj = dict(obj.attrib)
        else:
            values = obj.get('children', [])

        if 'fields' not in obj:
            obj['fields'] = {}

        for child in values:
            if child.tag == 'field':
                field_name = child.attrib['name']
                if 'ref' in child.attrib:
                    try:
                        obj['fields'][field_name] = ref(child.attrib['ref'])
                    except:
                        print('Error reading xml file file: ref:', child.attrib['ref'], self.path)
                        raise
                elif 'eval' in child.attrib:
                    obj['fields'][field_name] = eval(child.attrib['eval'], {'ref': functools.partial(ref, self.app)})
                elif 'model' in child.attrib:
                    obj['fields'][field_name] = ContentType.objects.only('pk').filter(name=child.attrib['model']).first().pk
                elif 'file' in child.attrib:
                    with open(
                        os.path.join(self.addon.path, child.attrib['file']), encoding='utf-8'
                    ) as f:
                        obj['fields'][field_name] = f.read()
                else:
                    s = child.text
                    if child.attrib.get('translate', trans):
                        s = (s,)
                    obj['fields'][field_name] = s

        obj_name = obj.pop('id')
        obj_id = None
        Model = apps[obj['model']]
        values = obj['fields']

        # # ui.view special case
        # if Model._meta.name == 'ui.view' and 'template_name' in values:
        #     template_name = values['template_name']
        #     values['template_name'] = self.app_config.schema + ':' + template_name
        #     assert '..' not in template_name
        #     template_name = os.path.join(self.app_config.path, self.app_config.template_folder, template_name)
        #     with open(template_name, encoding='utf-8') as f:
        #         values['content'] = f.read()

        no_update = 'no-update' not in obj
        try:
            obj_id = Object.objects.get(name=obj_name)
            if no_update != obj_id.can_update:
                obj_id.can_update = no_update
                obj_id.save(using=self.database)
            instance = obj_id.content_object
            if not no_update:
                return instance
        except ObjectDoesNotExist:
            instance = Model()
        pk = instance.pk
        children = {}
        for k, v in values.items():
            field = instance._meta.fields.get(k)
            if field:
                k = field.attname
            if isinstance(v, list) and isinstance(field, models.OneToManyField):
                children[k] = v
            elif isinstance(v, tuple) and isinstance(field, models.CharField) and not field.translate:
                children[k] = _(v[0])
            else:
                setattr(instance, k, v)
        instance.save(using=self.database)
        if pk is None:
            obj_id = Object.objects.using(self.database).create(
                schema=self.addon.schema,
                name=obj_name,
                object_id=instance.pk,
                model=ContentType.objects.get_by_natural_key(instance._meta.name),
                can_update=not obj.get('no-update', False),
            )
        for child, v in children.items():
            # Delete all items
            getattr(instance, child).delete(using=self.database)
            # Re-eval the xml data
            instance._meta.fields[k].deserialize(v, instance)
        return instance

    def read_menu(self, obj, parent=None, **attrs):
        lst = []
        action = None
        action_id = obj.attrib.get('action')
        if action_id:
            try:
                action = Object.objects.get_object(action_id).content_object
                action_id = action.pk
            except ObjectDoesNotExist:
                raise Exception('The object id "%s" does not exist' % action_id)
        s = obj.attrib.get('name')
        if s is None and action:
            s = action.name
        if 'parent' in obj.attrib:
            parent = Object.get_object(obj.attrib['parent']).object_id
        fields = {
            'parent_id': parent,
            'action_id': action_id,
            'name': s,
        }
        if obj.attrib.get('sequence'):
            fields['sequence'] = obj.attrib['sequence']
        menu = {
            'model': 'ui.menu',
            'id': obj.attrib.get('id'),
            'fields': fields
        }
        lst.append(menu)
        menu['children'] = []
        menu = self.read_object(menu, **attrs)
        for child in obj:
            r = self.read_menu(child, parent=menu.pk, **attrs)
            lst.extend(r)
        return lst

    def read_action(self, obj, **attrs):
        act = obj.attrib['type']
        model = obj.attrib.get('model')
        name = obj.attrib.get('name')
        if not name and model:
            name = str(apps[model]._meta.verbose_name_plural)
        fields = {
            'name': name,
            'model': model,
        }
        action = {
            'model': act,
            'id': obj.attrib['id'],
            'children': obj.getchildren(),
            'fields': fields,
        }
        return self.read_object(action, **attrs)

    def delete_object(self, obj, **attrs):
        try:
            xml_obj = Object.get_object(obj.attrib['id'])
            obj = xml_obj.object
            obj.delete()
            xml_obj.delete()
        except:
            pass
        else:
            return True

    def read_template(self, obj, **attrs):
        templ = {
            'model': 'ui.view',
            'id': obj.attrib.get('id'),
            'fields': {
                'name': obj.attrib.get('name'),
                'view_type': 'template',
            }
        }
        template_name = obj.attrib.get('filename')
        if template_name:
            templ['fields']['filename'] = template_name
            module = self.addon
            if module:
                filename = os.path.join(module.path, template_name)
                if os.path.isfile(filename):
                    with open(filename) as f:
                        templ['fields']['content'] = f.read()
        return self.read_object(templ)

    def read_view(self, obj, **attrs):
        view = {
            'model': 'ui.view',
            'id': obj.attrib.get('id'),
            'fields': {
                'model': obj.attrib.get('model'),
                'name': obj.attrib.get('name'),
                'filename': obj.attrib.get('file'),
                'view_type': obj.attrib.get('type'),
            }
        }
        if 'parent' in obj.attrib:
            view['fields']['parent'] = ref(obj.attrib['parent'])
        template_name = obj.attrib.get('file')
        if template_name:
            view['fields']['template_name'] = template_name
            module = self.addon
            if module:
                filename = os.path.join(module.path, 'templates', template_name)
                if os.path.isfile(filename):
                    with open(filename) as f:
                        view['fields']['content'] = f.read()
        return self.read_object(view)

    def read_report(self, obj, **attrs):
        model = obj.attrib.get('model')
        print('model name', model)
        view = {
            'model': 'ui.view',
            'id': obj.attrib.get('view-id'),
            'fields': {
                'view_type': 'report',
                'template_name': obj.attrib.get('template'),
                'name': obj.attrib.get('view-id'),
                'model': (model and ContentType.objects.only('pk').filter(name=model).one()) or None,
            },
        }
        view = self.read_object(view)
        report = {
            'model': 'ir.action.report',
            'id': obj.attrib.get('id'),
            'children': obj.getchildren(),
            'fields': {
                'report_type': obj.attrib.get('type', 'paginated'),
                'name': obj.attrib.get('name'),
                'view': view,
                'model': model,
            }
        }
        return self.read_object(report)

    TAGS = {
        'object': read_object,
        'action': read_action,
        'template': read_template,
        'view': read_view,
        'menuitem': read_menu,
        'report': read_report,
        'delete': delete_object,
    }
