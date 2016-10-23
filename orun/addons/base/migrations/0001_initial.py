# Generated by Orun 0.0.1.dev20161009000800 on 2016-10-09 00:08
from orun.db import migrations, models
import orun.db.models.deletion


class Migration(migrations.Migration):

    initial = True
    fixtures = ['modules.xml', 'actions.xml', 'menu.xml', 'currency.xml', 'country.xml', 'partner.xml']

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Model',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('app_label', models.CharField(max_length=64, null=False)),
                ('object_name', models.CharField(max_length=128, null=False)),
                ('object_type', models.CharField(max_length=16, null=False)),
                ('description', models.TextField()),
                ('parent', models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.model')),
            ],
            options={
                'name': 'sys.model',
                'db_table': 'sys_model',
            },
        ),
        migrations.CreateModel(
            name='Action',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('action_type', models.CharField(max_length=32, null=False)),
                ('usage', models.TextField()),
                ('description', models.TextField()),
            ],
            options={
                'name': 'sys.action',
                'db_table': 'sys_action',
            },
        ),
        migrations.CreateModel(
            name='Association',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('source_id', models.BigIntegerField()),
                ('target_id', models.BigIntegerField()),
                ('comment', models.TextField()),
            ],
            options={
                'name': 'sys.association',
                'db_table': 'sys_association',
            },
        ),
        migrations.CreateModel(
            name='Attachment',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('file_name', models.CharField(max_length=256, null=False)),
                ('description', models.TextField()),
                ('field', models.CharField(max_length=128)),
                ('object_id', models.BigIntegerField()),
                ('att_type', models.CharField(max_length=16)),
                ('stored_file_name', models.CharField(max_length=512)),
                ('url', models.CharField(max_length=1024)),
                ('length', models.BigIntegerField()),
                ('checksum', models.CharField(max_length=40)),
                ('mimetype', models.CharField(max_length=128)),
                ('is_public', models.BooleanField(null=False)),
            ],
            options={
                'name': 'sys.attachment',
                'db_table': 'sys_attachment',
            },
        ),
        migrations.CreateModel(
            name='Country',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('code', models.CharField(max_length=2)),
                ('address_format', models.TextField()),
                ('phone_code', models.PositiveSmallIntegerField()),
                ('image_flag', models.CharField(max_length=256)),
            ],
            options={
                'name': 'res.country',
                'db_table': 'res_country',
            },
        ),
        migrations.CreateModel(
            name='CountryGroup',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('countries', models.ManyToManyField(to='res.country')),
            ],
            options={
                'name': 'res.country.group',
                'db_table': 'res_country_group',
            },
        ),
        migrations.CreateModel(
            name='CountryState',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('code', models.CharField(max_length=3, null=False)),
                ('country', models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='res.country')),
            ],
            options={
                'name': 'res.country.state',
                'db_table': 'res_country_state',
            },
        ),
        migrations.CreateModel(
            name='Currency',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=3, null=False)),
                ('symbol', models.CharField(max_length=4)),
                ('rounding', models.FloatField()),
            ],
            options={
                'name': 'res.currency',
                'db_table': 'res_currency',
            },
        ),
        migrations.CreateModel(
            name='CustomView',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('content', models.TextField()),
            ],
            options={
                'name': 'ui.view.custom',
                'db_table': 'ui_view_custom',
            },
        ),
        migrations.CreateModel(
            name='Field',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('full_name', models.CharField(max_length=256)),
                ('copy', models.BooleanField(null=False)),
                ('required', models.BooleanField(null=False)),
                ('readonly', models.BooleanField(null=False)),
                ('index', models.BooleanField(null=False)),
                ('size', models.IntegerField()),
                ('field_type', models.CharField(max_length=16)),
                ('domain', models.TextField()),
            ],
            options={
                'name': 'sys.model.field',
                'db_table': 'sys_model_field',
            },
        ),
        migrations.CreateModel(
            name='Group',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, unique=True)),
                ('active', models.BooleanField(null=False)),
            ],
            options={
                'name': 'auth.group',
                'db_table': 'auth_group',
            },
        ),
        migrations.CreateModel(
            name='Language',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('code', models.CharField(max_length=16)),
                ('iso_code', models.CharField(max_length=16)),
                ('active', models.BooleanField(null=False)),
            ],
            options={
                'name': 'res.language',
                'db_table': 'res_language',
            },
        ),
        migrations.CreateModel(
            name='Menu',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('sequence', models.IntegerField()),
                ('icon', models.CharField(max_length=256)),
            ],
            options={
                'name': 'ui.menu',
                'db_table': 'ui_menu',
            },
        ),
        migrations.CreateModel(
            name='Module',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128)),
                ('installable', models.BooleanField(null=False)),
                ('installed', models.BooleanField(null=False)),
            ],
            options={
                'name': 'sys.module',
                'db_table': 'sys_module',
            },
        ),
        migrations.CreateModel(
            name='ModuleCategory',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('sequence', models.IntegerField()),
                ('visible', models.BooleanField(null=False)),
            ],
            options={
                'name': 'sys.module.category',
                'db_table': 'sys_module_category',
            },
        ),
        migrations.CreateModel(
            name='Object',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('model', models.CharField(max_length=128, null=False)),
                ('object_id', models.BigIntegerField()),
                ('app_label', models.CharField(max_length=64, null=False)),
                ('can_update', models.BooleanField(null=False)),
            ],
            options={
                'name': 'sys.object',
                'db_table': 'sys_object',
            },
        ),
        migrations.CreateModel(
            name='Partner',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128)),
                ('active', models.BooleanField(null=False)),
                ('color', models.PositiveIntegerField()),
                ('email', models.EmailField(max_length=254)),
                ('website', models.URLField()),
                ('comments', models.TextField()),
                ('barcode', models.CharField(max_length=128)),
                ('is_customer', models.BooleanField(null=False)),
                ('is_supplier', models.BooleanField(null=False)),
                ('is_employee', models.BooleanField(null=False)),
                ('address', models.CharField(max_length=256)),
                ('address_2', models.CharField(max_length=256)),
                ('zip', models.CharField(max_length=32)),
                ('city', models.CharField(max_length=128)),
                ('phone', models.CharField(max_length=64)),
                ('fax', models.CharField(max_length=64)),
                ('mobile', models.CharField(max_length=64)),
                ('birth_date', models.CharField(max_length=64)),
                ('is_company', models.BooleanField(null=False)),
                ('company_type', models.CharField(max_length=16)),
            ],
            options={
                'name': 'res.partner',
                'db_table': 'res_partner',
            },
        ),
        migrations.CreateModel(
            name='PartnerCategory',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128)),
                ('color', models.PositiveIntegerField()),
            ],
            options={
                'name': 'res.partner.category',
                'db_table': 'res_partner_category',
            },
        ),
        migrations.CreateModel(
            name='PartnerTitle',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('abbreviation', models.CharField(max_length=32)),
            ],
            options={
                'name': 'res.partner.title',
                'db_table': 'res_partner_title',
            },
        ),
        migrations.CreateModel(
            name='Permission',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('can_read', models.BooleanField(null=False)),
                ('can_change', models.BooleanField(null=False)),
                ('can_create', models.BooleanField(null=False)),
                ('can_delete', models.BooleanField(null=False)),
                ('model', models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='sys.model')),
            ],
            options={
                'name': 'auth.permission',
                'db_table': 'auth_permission',
            },
        ),
        migrations.CreateModel(
            name='Property',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('float_value', models.FloatField()),
                ('int_value', models.BigIntegerField()),
                ('text_value', models.TextField()),
                ('binary_value', models.BinaryField()),
                ('ref_value', models.CharField(max_length=1024)),
                ('datetime_value', models.DateTimeField()),
                ('prop_type', models.CharField(max_length=16, null=False)),
                ('field', models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='sys.model.field')),
            ],
            options={
                'name': 'sys.property',
                'db_table': 'sys_property',
            },
        ),
        migrations.CreateModel(
            name='Rule',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128)),
                ('active', models.BooleanField(null=False)),
                ('domain', models.TextField()),
                ('can_read', models.BooleanField(null=False)),
                ('can_change', models.BooleanField(null=False)),
                ('can_create', models.BooleanField(null=False)),
                ('can_delete', models.BooleanField(null=False)),
                ('groups', models.ManyToManyField(to='auth.group')),
                ('model', models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.model')),
            ],
            options={
                'name': 'auth.rule',
                'db_table': 'auth_rule',
            },
        ),
        migrations.CreateModel(
            name='Sequence',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=128, null=False)),
                ('code', models.CharField(max_length=128)),
                ('implementation', models.CharField(max_length=16)),
                ('active', models.BooleanField(null=False)),
                ('prefix', models.CharField(max_length=128)),
                ('suffix', models.CharField(max_length=128)),
                ('next_id', models.BigIntegerField()),
                ('current_id', models.BigIntegerField()),
                ('step', models.IntegerField()),
                ('padding', models.IntegerField()),
                ('use_date_range', models.BooleanField(null=False)),
            ],
            options={
                'name': 'sys.sequence',
                'db_table': 'sys_sequence',
            },
        ),
        migrations.CreateModel(
            name='SequenceDateRange',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('date_from', models.DateField(null=False)),
                ('date_to', models.DateField(null=False)),
                ('next_id', models.BigIntegerField()),
                ('current_id', models.BigIntegerField()),
                ('sequence', models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='sys.sequence')),
            ],
            options={
                'name': 'sys.sequence.date.range',
                'db_table': 'sys_sequence_date_range',
            },
        ),
        migrations.CreateModel(
            name='UserCompany',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
            ],
            options={
                'name': 'auth.user.company',
                'db_table': 'auth_user_company',
            },
        ),
        migrations.CreateModel(
            name='View',
            fields=[
                ('id', models.BigAutoField(null=False, primary_key=True)),
                ('name', models.CharField(max_length=100)),
                ('active', models.BooleanField(null=False)),
                ('view_type', models.CharField(max_length=64, null=False)),
                ('mode', models.CharField(max_length=16, null=False)),
                ('priority', models.IntegerField(null=False)),
                ('template_name', models.FilePathField(max_length=256)),
                ('content', models.TextField()),
                ('model', models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.model')),
                ('parent', models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='ui.view')),
            ],
            options={
                'name': 'ui.view',
                'db_table': 'ui_view',
            },
        ),
        migrations.CreateModel(
            name='Company',
            fields=[
                ('partner_ptr', models.OneToOneField(null=False, on_delete=orun.db.models.deletion.CASCADE, parent_link=True, primary_key=True, to='res.partner')),
                ('report_header', models.TextField()),
                ('report_footer', models.TextField()),
                ('report_paper', models.CharField(max_length=32)),
                ('currency', models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.currency')),
                ('parent', models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.company')),
            ],
            options={
                'name': 'res.company',
                'db_table': 'res_company',
            },
        ),
        migrations.CreateModel(
            name='ReportAction',
            fields=[
                ('action_ptr', models.OneToOneField(null=False, on_delete=orun.db.models.deletion.CASCADE, parent_link=True, primary_key=True, to='sys.action')),
                ('report_type', models.CharField(max_length=32, null=False)),
                ('report_name', models.CharField(max_length=256, null=False)),
            ],
            options={
                'name': 'sys.action.report',
                'db_table': 'sys_action_report',
            },
        ),
        migrations.CreateModel(
            name='ServerAction',
            fields=[
                ('action_ptr', models.OneToOneField(null=False, on_delete=orun.db.models.deletion.CASCADE, parent_link=True, primary_key=True, to='sys.action')),
            ],
            options={
                'name': 'sys.action.server',
                'db_table': 'sys_action_server',
            },
        ),
        migrations.CreateModel(
            name='User',
            fields=[
                ('partner_ptr', models.OneToOneField(null=False, on_delete=orun.db.models.deletion.CASCADE, parent_link=True, primary_key=True, to='res.partner')),
                ('date_joined', models.DateTimeField()),
                ('username', models.CharField(max_length=255)),
                ('password', models.CharField(max_length=255)),
                ('signature', models.HtmlField()),
                ('is_active', models.BooleanField(null=False)),
                ('is_staff', models.BooleanField(null=False)),
                ('is_superuser', models.BooleanField(null=False)),
            ],
            options={
                'name': 'auth.user',
                'db_table': 'auth_user',
            },
        ),
        migrations.CreateModel(
            name='WindowAction',
            fields=[
                ('action_ptr', models.OneToOneField(null=False, on_delete=orun.db.models.deletion.CASCADE, parent_link=True, primary_key=True, to='sys.action')),
                ('domain', models.TextField()),
                ('context', models.TextField()),
                ('object_id', models.BigIntegerField()),
                ('view_mode', models.CharField(max_length=128)),
                ('target', models.CharField(max_length=16)),
                ('limit', models.PositiveIntegerField()),
                ('auto_search', models.BooleanField(null=False)),
                ('model', models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='sys.model')),
                ('view', models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='ui.view')),
            ],
            options={
                'name': 'sys.action.window',
                'db_table': 'sys_action_window',
            },
        ),
        migrations.AddField(
            model_name='partner',
            name='country',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.SET_NULL, to='res.country'),
        ),
        migrations.AddField(
            model_name='partner',
            name='language',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.language'),
        ),
        migrations.AddField(
            model_name='partner',
            name='state',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.SET_NULL, to='res.country.state'),
        ),
        migrations.AddField(
            model_name='partner',
            name='title',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.partner.title'),
        ),
        migrations.AddField(
            model_name='module',
            name='category',
            field=models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='sys.module.category'),
        ),
        migrations.AddField(
            model_name='menu',
            name='action',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.action'),
        ),
        migrations.AddField(
            model_name='menu',
            name='groups',
            field=models.ManyToManyField(to='auth.group'),
        ),
        migrations.AddField(
            model_name='menu',
            name='parent',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='ui.menu'),
        ),
        migrations.AddField(
            model_name='group',
            name='permissions',
            field=models.ManyToManyField(to='auth.permission'),
        ),
        migrations.AddField(
            model_name='field',
            name='model',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.model'),
        ),
        migrations.AddField(
            model_name='customview',
            name='view',
            field=models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='ui.view'),
        ),
        migrations.AddField(
            model_name='attachment',
            name='model',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.model'),
        ),
        migrations.AddField(
            model_name='association',
            name='source_content',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.model'),
        ),
        migrations.AddField(
            model_name='association',
            name='target_content',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.model'),
        ),
        migrations.AddField(
            model_name='usercompany',
            name='company',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.company'),
        ),
        migrations.AddField(
            model_name='usercompany',
            name='user',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='auth.user'),
        ),
        migrations.AddField(
            model_name='user',
            name='action',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='sys.action'),
        ),
        migrations.AddField(
            model_name='user',
            name='companies',
            field=models.ManyToManyField(to='res.company'),
        ),
        migrations.AddField(
            model_name='user',
            name='groups',
            field=models.ManyToManyField(to='auth.group'),
        ),
        migrations.AddField(
            model_name='user',
            name='user_company',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.company'),
        ),
        migrations.AddField(
            model_name='sequence',
            name='company',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.company'),
        ),
        migrations.AddField(
            model_name='property',
            name='company',
            field=models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='res.company'),
        ),
        migrations.AddField(
            model_name='partner',
            name='company',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.company'),
        ),
        migrations.AddField(
            model_name='partner',
            name='user',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='auth.user'),
        ),
        migrations.AddField(
            model_name='customview',
            name='user',
            field=models.ForeignKey(null=False, on_delete=orun.db.models.deletion.CASCADE, to='auth.user'),
        ),
        migrations.AddField(
            model_name='attachment',
            name='company',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.company'),
        ),
        migrations.AddField(
            model_name='country',
            name='currency',
            field=models.ForeignKey(on_delete=orun.db.models.deletion.CASCADE, to='res.currency'),
        ),
    ]
