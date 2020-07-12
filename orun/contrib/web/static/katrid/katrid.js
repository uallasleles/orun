var Katrid;
(function (Katrid) {
    var Actions;
    (function (Actions) {
        Actions.registry = {};
        class Action {
            constructor(config) {
                this.info = config.info;
                this.scope = config.scope;
                this.location = config.location;
                this.app = Katrid.app;
                Katrid.app.actionManager.addAction(this);
                let $container;
                if (!config.$container)
                    $container = Katrid.app.$element;
                this.$parent = $container;
            }
            getContext() {
                return {};
            }
            getBreadcrumb() {
            }
            get breadcrumb() {
                return this.getBreadcrumb();
            }
            $destroy() {
                Katrid.app.actionManager.remove(this);
                this.scope.$destroy();
                if (this.$element)
                    this.$element.remove();
                else
                    this.$parent.empty();
            }
            get id() {
                return this.info.id;
            }
            get context() {
                console.log(this.info);
                if (_.isString(this.info.context))
                    this._context = JSON.parse(this.info.context);
                else
                    this._context = {};
                let searchParams = window.location.href.split('#', 2)[1];
                if (searchParams) {
                    const urlParams = new URLSearchParams(searchParams);
                    for (let [k, v] of urlParams)
                        if (k.startsWith('default_')) {
                            this._context[k] = v;
                        }
                }
                return this._context;
            }
            doAction(act) {
                let type = act.type || act.action_type;
                return Actions.registry[type].dispatchAction(this, act);
            }
            openObject(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                if (evt.ctrlKey) {
                    window.open(evt.target.href);
                    return false;
                }
                else {
                    console.log(evt.target.href);
                    location.hash = evt.target.href;
                }
                return false;
            }
            restore() { }
            apply() { }
            backTo(index) {
                let b = Katrid.app.actionManager.breadcrumb[index];
                if (b)
                    Katrid.app.actionManager.back(b.action, b.url);
                return;
            }
            execute() {
                $(this.app).trigger('action.execute', this);
            }
            getCurrentTitle() {
                return this.info.display_name;
            }
            search() {
                if (!this.isDialog) {
                    return this.location.search.apply(null, arguments);
                }
            }
            onHashChange(params) {
                $(this.app).trigger('action', [this]);
            }
            $attach() {
            }
            refreshBreadcrumb() {
                let templ = Katrid.app.getTemplate('view.breadcrumb.jinja2', {
                    breadcrumb: Katrid.app.actionManager.breadcrumb,
                    action: this
                });
                templ = Katrid.Core.$compile(templ)(this.scope);
                this.$element.find('.breadcrumb-nav').html(templ);
            }
        }
        Actions.Action = Action;
        class ViewAction extends Action {
            async onHashChange(params) {
                location.hash = '#/app/?' + $.param(params);
                let svc = new Katrid.Services.Model('ir.action.view');
                let res = await svc.post('get_view', { args: [this.info.view[0]] });
                let content = res.content;
                $(Katrid.app.$element).html(Katrid.Core.$compile(content)(this.scope));
            }
        }
        ViewAction.actionType = 'ir.action.view';
        Actions.ViewAction = ViewAction;
        class UrlAction extends Action {
            constructor(info) {
                super(info);
                window.location.href = info.url;
            }
        }
        UrlAction.actionType = 'ir.action.url';
        class ActionManager {
            constructor() {
                this.$cachedActions = {};
                this.actions = [];
                this.currentAction = null;
                this.mainAction = null;
            }
            addAction(action) {
                if (!this.mainAction)
                    this.mainAction = action;
                this.actions.push(action);
                this.currentAction = action;
            }
            back(action, url) {
                if (action)
                    this.action = action;
                else if (this.length > 1) {
                    this.action = this.actions[this.length - 2];
                    this.action.$attach();
                }
                this.action.refreshBreadcrumb();
                if (angular.isString(url))
                    Katrid.app.loadPage(url);
                else if (url)
                    Katrid.app.$location.search(url);
            }
            remove(action) {
                this.actions.splice(this.actions.indexOf(action), this.length);
                if (this.length === 0)
                    this.mainAction = null;
            }
            get length() {
                return this.actions.length;
            }
            get action() {
                return this.currentAction;
            }
            get context() {
                if (this.currentAction)
                    return this.currentAction.context;
            }
            set action(action) {
                let i = this.actions.indexOf(action);
                if (i > -1) {
                    i++;
                    while (this.length > i)
                        this.actions[i].$destroy();
                    this.currentAction = action;
                }
            }
            clear() {
                for (let action of this.actions)
                    action.$destroy();
                this.actions.length = 0;
                this.mainAction = null;
                this.currentAction = null;
            }
            get path() {
                return this.action.path;
            }
            doAction(action) {
            }
            async onHashChange(params, reset) {
                let actionId = params.action;
                if (reset)
                    this.clear();
                let oldAction, action;
                action = oldAction = this.currentAction;
                if (actionId in this.$cachedActions) {
                    let actionInfo = this.$cachedActions[actionId];
                    let scope = this.createScope();
                    action = scope.action = new Katrid.Actions.registry[actionInfo.action_type]({ info: actionInfo, scope, location: params });
                }
                else if (!actionId && params.model && (!action || (action.params && (action.params.model !== params.model)))) {
                    let svc = new Katrid.Services.Model(params.model);
                    let actionInfo = await svc.rpc('get_formview_action', [params.id]);
                    let scope = this.createScope();
                    action = scope.action = new Katrid.Actions.registry[actionInfo.action_type]({ info: actionInfo, scope, location: params });
                }
                else if (!(this.currentAction && (this.currentAction.info.id == actionId))) {
                    if (this.currentAction && reset)
                        this.currentAction.$destroy();
                    let actionInfo = await Katrid.Services.Actions.load(actionId);
                    let scope = this.createScope();
                    console.log('action type', actionInfo.action_type);
                    action = scope.action = new Katrid.Actions.registry[actionInfo.action_type]({ info: actionInfo, scope, location: params });
                }
                await action.onHashChange(params);
            }
            createScope() {
                let scope = Katrid.app.$scope.$new(true);
                scope._ = _;
                return scope;
            }
            get breadcrumb() {
                let breadcrumb = [];
                for (let action of this.actions) {
                    let bc = action.breadcrumb;
                    if (bc && bc.length) {
                        for (let b of bc)
                            b.isLeaf = false;
                        breadcrumb.push(...bc);
                    }
                }
                breadcrumb[breadcrumb.length - 1].isLeaf = true;
                return breadcrumb;
            }
        }
        Actions.ActionManager = ActionManager;
        Actions.registry[ViewAction.actionType] = ViewAction;
        Actions.registry[UrlAction.actionType] = UrlAction;
    })(Actions = Katrid.Actions || (Katrid.Actions = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Actions;
    (function (Actions) {
        class ClientAction extends Katrid.Actions.Action {
            static register(tag, obj) {
                this.registry[tag] = obj;
            }
            static executeTag(parent, act) {
                let action = this.registry[act.tag];
                if (action.prototype instanceof Katrid.Forms.Views.ActionView) {
                    action = new action(parent.scope);
                    action.renderTo(parent);
                }
                else
                    console.log('is a function');
            }
            static tagButtonClick(btn) {
                let action = {
                    type: 'ir.action.client',
                    tag: btn.attr('name'),
                    target: btn.attr('target') || 'new',
                };
                action = new ClientAction({
                    action, app: Katrid.app.actionManager.action.scope, location: Katrid.app.actionManager.action.location
                });
                action.execute();
            }
            tag_refresh() {
                this.dataSource.refresh();
            }
            get templateUrl() {
                console.log(this.tag);
                return this.tag.templateUrl;
            }
            async execute() {
                let tag = ClientAction.registry[this.info.tag];
                this.tag = tag;
                if (tag.prototype instanceof Katrid.Forms.Views.ClientView) {
                    this.tag = new tag(this);
                    let el = await this.tag.render();
                    if (this.info.target === 'new') {
                        el = el.modal();
                    }
                    else {
                        $('#katrid-action-view').empty().append(el);
                    }
                }
                else if (_.isString(tag))
                    this.constructor.registry[tag].apply(this);
            }
            async routeUpdate(location) {
            }
            get template() {
                return this.tag.template;
            }
        }
        ClientAction.actionType = 'ir.action.client';
        ClientAction.registry = {};
        Actions.ClientAction = ClientAction;
        Actions.registry[ClientAction.actionType] = ClientAction;
    })(Actions = Katrid.Actions || (Katrid.Actions = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Actions;
    (function (Actions) {
        class ReportAction extends Katrid.Actions.Action {
            constructor(info, scope, location) {
                super(info);
                this.templateUrl = 'view.report.jinja2';
                this.userReport = {};
            }
            static async dispatchBindingAction(parent, action) {
                let format = localStorage.katridReportViewer || 'pdf';
                let sel = parent.selection;
                if (sel)
                    sel = sel.join(',');
                let params = { data: [{ name: 'id', value: sel }] };
                let svc = new Katrid.Services.Model('ir.action.report');
                let res = await svc.post('export_report', { args: [action.id], kwargs: { format, params } });
                if (res.open)
                    return window.open(res.open);
            }
            get name() {
                return this.info.name;
            }
            userReportChanged(report) {
                return this.location.search({
                    user_report: report
                });
            }
            async onHashChange(params) {
                console.log('report hash change', params);
                this.userReport.id = params.user_report;
                if (this.userReport.id) {
                    let svc = new Katrid.Services.Model('ir.action.report');
                    let res = await svc.post('load_user_report', { kwargs: { user_report: this.userReport.id } });
                    this.userReport.params = res.result;
                }
                else {
                }
                location.hash = '#/app/?' + $.param(params);
                let templ = Katrid.Reports.renderDialog(this);
                templ = Katrid.Core.$compile(templ)(this.scope);
                $('#katrid-action-view').empty().append(templ);
            }
        }
        ReportAction.actionType = 'ir.action.report';
        Actions.ReportAction = ReportAction;
        Katrid.Actions.registry[ReportAction.actionType] = ReportAction;
        console.log('katrid report actions');
    })(Actions = Katrid.Actions || (Katrid.Actions = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Actions;
    (function (Actions) {
        class WindowAction extends Katrid.Actions.Action {
            constructor(config) {
                super(config);
                this._cachedViews = {};
                this.model = config.scope.model;
                this.viewMode = config.info.view_mode;
                this.viewModes = this.viewMode.split(',');
                if (config.info.model)
                    config.scope.model = this.model = new Katrid.Services.Model(config.info.model);
                this.dataSource = new Katrid.Data.DataSource({
                    model: this.model,
                    scope: config.scope,
                    action: this,
                });
                config.scope.$on('dataStateChange', this.onDataStateChange);
                config.scope.$on('afterCancel', (evt, dataSource) => {
                    if (dataSource === this.dataSource)
                        this.afterCancel(evt, dataSource);
                });
            }
            afterCancel(evt, dataSource) {
                if (dataSource.state === Katrid.Data.DataSourceState.inserting) {
                    this.dataSource.record = {};
                    this.back();
                }
            }
            back() {
            }
            setDirty(field) {
                const control = this.form[field];
                console.log(control);
                if (control) {
                    control.$setDirty();
                }
            }
            async onHashChange(params) {
                let invalidate = false;
                let allowedParams = ['action', 'view_type', 'menu_id', 'model'];
                let loadRecord = (this.params && (this.params.id !== params.id));
                this.params = {};
                if (!params.view_type) {
                    this.params.view_type = this.viewModes[0];
                    invalidate = true;
                }
                if (!params.model) {
                    this.params.model = this.info.model;
                    invalidate = true;
                }
                Object.assign(this.params, params);
                if (this.params.view_type === 'form')
                    allowedParams.splice(0, 0, 'id');
                for (let k of Object.keys(this.params))
                    if (!allowedParams.includes(k) && !k.startsWith('default_')) {
                        invalidate = true;
                    }
                if (invalidate) {
                    let oldParams = this.params;
                    this.params = {};
                    for (let k of allowedParams)
                        this.params[k] = oldParams[k];
                    if (!this.params.action)
                        delete this.params.action;
                    history.replaceState(null, null, '#/app/?' + $.param(this.params));
                }
                let viewType = this.params.view_type;
                if (viewType !== this.viewType) {
                    this.viewType = viewType;
                    await this.execute();
                }
                if (this.params.id && (this.dataSource.recordId != this.params.id))
                    await this.dataSource.get(this.params.id);
            }
            rpc(method, data, event) {
                if (event)
                    event.stopPropagation();
                if (!data)
                    data = {};
                else if (_.isArray(data))
                    data = { args: data };
                else if (!_.isObject(data))
                    data = { args: [data] };
                this.model.rpc(method, data.args, data.kwargs);
            }
            getContext() {
                let ctx = super.getContext();
                let sel = this.selection;
                if (sel && sel.length) {
                    ctx.active_id = sel[0];
                    ctx.active_ids = sel;
                }
                return ctx;
            }
            getCurrentTitle() {
                if (this.viewType === 'form') {
                    return this.scope.record.display_name;
                }
                return super.getCurrentTitle();
            }
            switchView(viewType, params) {
                if (viewType !== this.viewType) {
                    let search = {};
                    Object.assign(search, Katrid.app.$location.$$search);
                    if (params)
                        Object.assign(search, params);
                    search.view_type = viewType;
                    Katrid.app.$location.search(search);
                }
            }
            createNew() {
                this.switchView('form', { id: null });
            }
            async deleteSelection(backToSearch) {
                let sel = this.selection;
                if (!sel)
                    return false;
                if (((sel.length === 1) && confirm(Katrid.i18n.gettext('Confirm delete record?'))) ||
                    ((sel.length > 1) && confirm(Katrid.i18n.gettext('Confirm delete records?')))) {
                    await this.dataSource.delete(sel);
                    if (backToSearch) {
                        this.app.actionManager.backTo(-1);
                        this.dataSource.refresh();
                    }
                    else
                        this.dataSource.next();
                    for (let rec of sel) {
                        let i = this.dataSource.findById(rec);
                        console.log(this.dataSource.records.indexOf(i));
                        this.dataSource.records.splice(this.dataSource.records.indexOf(i), 1);
                    }
                    this.scope.$apply();
                }
            }
            async copy() {
                this.viewType = 'form';
                await this.dataSource.copy(this.scope.record.id);
                return false;
            }
            async copyTo(configId) {
                if (this.scope.recordId) {
                    let svc = new Katrid.Services.Model('ir.copy.to');
                    let res = await svc.rpc('copy_to', [configId, this.scope.recordId]);
                    let model = new Katrid.Services.Model(res.model);
                    let views = await model.getViewInfo({ view_type: 'form' });
                    let wnd = new Katrid.Forms.Dialogs.Window({ scope: this.scope, view: views, model });
                    wnd.createNew({ defaultValues: res.value });
                }
            }
            makeUrl(viewType) {
                if (!viewType)
                    viewType = this.viewModes[0];
                let search = {
                    action: this.info.id,
                    view_type: viewType,
                    menu_id: Katrid.app.$location.$$search.menu_id,
                };
                if ((viewType === 'form') && this.record)
                    search.id = this.record.id;
                return search;
            }
            get record() {
                return this.scope.record;
            }
            get searchModes() {
                return this.viewModes.filter(v => v !== 'form');
            }
            getBreadcrumb() {
                let breadcrumb = [];
                if (this.searchModes.length) {
                    breadcrumb.push({ action: this, url: this.makeUrl(this.lastViewType), text: this.info.record_name });
                }
                if (this.viewType === 'form') {
                    let h = { action: this, url: this.makeUrl('form') };
                    if (this === Katrid.app.actionManager.currentAction)
                        h.text = '${ record.record_name }';
                    else
                        h.text = this.record && this.record.record_name;
                    breadcrumb.push(h);
                }
                return breadcrumb;
            }
            $detach() {
                this.$element.detach();
            }
            $attach() {
                this.$element.appendTo(this.$parent);
            }
            async execute() {
                super.execute();
                if (!this.views) {
                    let res = await this.model.loadViews({
                        views: this.info.views,
                        action: this.info.id,
                        toolbar: true
                    });
                    this.fields = res.fields;
                    this.fieldList = res.fieldList;
                    this.views = res.views;
                    let templ = Katrid.app.getTemplate('ir.action.window.jinja2', { action: this });
                    templ = Katrid.Core.$compile(templ)(this.scope);
                    templ[0].action = this;
                    this.$parent.html(templ);
                    this.$element = templ;
                    this.$container = this.$element.find('.action-view-content:first');
                }
                let firstTime = false;
                if (this.view) {
                    console.log('cached', this.view.el);
                    this._cachedViews[this.view.viewType] = this.view;
                    this.view.el.detach();
                }
                else
                    firstTime = true;
                this.$container.empty();
                this.refreshBreadcrumb();
                this.scope.view = this.views[this.viewType];
                let view;
                if (this.viewType in this._cachedViews) {
                    view = this._cachedViews[this.viewType];
                    this.$container.append(view.el);
                }
                else {
                    view = new Katrid.Forms.Views.registry[this.viewType]({ action: this, viewInfo: this.scope.view });
                    view.renderTo(this.$container);
                    view.ready();
                }
                if (this.viewType !== 'form') {
                    this.lastViewType = this.viewType;
                    this.lastUrl = location.hash;
                    this.dataSource.refresh(true);
                }
                setTimeout(() => {
                    if ((this.viewType === 'form') && !Katrid.app.$location.$$search.id)
                        this.dataSource.insert();
                });
            }
            get viewType() {
                return this._viewType;
            }
            set viewType(value) {
                if (value !== this._viewType) {
                    if (value !== 'form')
                        this.dataSource.recordId = null;
                    this.dataSource.destroyChildren();
                    this._viewType = value;
                }
                return;
            }
            searchText(q) {
                return this.location.search('q', q);
            }
            _prepareParams(params) {
                let r = {};
                for (let p of Array.from(params)) {
                    if (p.field && (p.field.type === 'ForeignKey')) {
                        r[p.field.name] = p.id;
                    }
                    else {
                        r[p.id.name + '__icontains'] = p.text;
                    }
                }
                return r;
            }
            setSearchParams(params) {
                let p = {};
                if (this.info.domain)
                    p = $.parseJSON(this.info.domain);
                for (let [k, v] of Object.entries(p)) {
                    let arg = {};
                    arg[k] = v;
                    params.push(arg);
                }
                console.log('search params', params);
                return this.dataSource.search(params);
            }
            applyGroups(groups, params) {
                return this.dataSource.groupBy(groups, params);
            }
            groupHeaderClick(record, index) {
                console.log('group header click', record);
                record.$expanded = !record.$expanded;
                if (record.$expanded) {
                    this.dataSource.expandGroup(index, record);
                }
                else {
                    this.dataSource.collapseGroup(index, record);
                }
            }
            async loadGroupRecords(group) {
                if (group.count > 0) {
                    let res = await this.dataSource.model.search({ params: group.$params });
                    group.records = res.data;
                    console.log(group);
                    this.scope.$apply();
                }
            }
            doViewAction(viewAction, target, confirmation, prompt) {
                return this._doViewAction(this.scope, viewAction, target, confirmation, prompt);
            }
            _doViewAction(scope, viewAction, target, confirmation, prompt) {
                let promptValue = null;
                if (prompt) {
                    promptValue = window.prompt(prompt);
                }
                if (!confirmation || (confirmation && confirm(confirmation))) {
                    return this.model.doViewAction({ action_name: viewAction, target, prompt: promptValue })
                        .then(function (res) {
                        let msg, result;
                        if (res.status === 'open') {
                            return window.open(res.open);
                        }
                    });
                }
            }
            async formButtonClick(id, meth, self) {
                const res = await this.scope.model.rpc(meth, [id]);
                if (res.open)
                    return window.open(res.open);
                if (res.download) {
                    let a = document.createElement('a');
                    a.href = res.download;
                    a.click();
                    return;
                }
                if (res.tag === 'refresh')
                    this.dataSource.refresh();
                if (res.type) {
                    const act = new (Katrid.Actions.registry[res.type])(res, this.scope, this.scope.location);
                    act.execute();
                }
            }
            ;
            doBindingAction(evt) {
                this.selection;
                Katrid.Services.Actions.load($(evt.currentTarget).data('id'))
                    .then((action) => {
                    if (action.action_type === 'ir.action.report')
                        Katrid.Actions.ReportAction.dispatchBindingAction(this, action);
                });
            }
            listRowClick(index, row, evt) {
                if (row.$hasChildren) {
                    this.groupHeaderClick(row, index);
                }
                else {
                    let search = {
                        id: row.id,
                        action: this.info.id,
                        view_type: 'form',
                        menu_id: Katrid.app.$location.$$search.menu_id,
                    };
                    if (evt.ctrlKey) {
                        return;
                    }
                    else
                        Katrid.app.$location.search(search);
                    this.dataSource.recordIndex = index;
                }
            }
            onDataStateChange(event, dataSource) {
                let self = dataSource.scope.action;
                if (dataSource.changing)
                    setTimeout(() => {
                        if (self.$element)
                            for (let el of Array.from(self.$element.find("input[type!=hidden].form-field:visible"))) {
                                el = $(el);
                                if (!el.attr('readonly')) {
                                    $(el).focus();
                                    return;
                                }
                            }
                    });
            }
            autoReport() {
                return this.model.autoReport()
                    .then(function (res) {
                    if (res.ok && res.result.open) {
                        return window.open(res.result.open);
                    }
                });
            }
            showDefaultValueDialog() {
            }
            selectToggle(el) {
                this._selection = $(el).closest('table').find('td.list-record-selector :checkbox').filter(':checked');
                this.selectionLength = this._selection.length;
            }
            get selection() {
                if (this.viewType === 'form') {
                    if (this.scope.recordId)
                        return [this.scope.recordId];
                    else
                        return;
                }
                if (this._selection)
                    return Array.from(this._selection).map((el) => ($(el).data('id')));
            }
            set attachments(value) {
                this.scope.$apply(() => this.scope.attachments = value);
            }
            deleteAttachment(attachments, index) {
                let att = attachments[index];
                if (confirm(Katrid.i18n.gettext('Confirm delete attachment?'))) {
                    attachments.splice(index, 1);
                    Katrid.Services.Attachments.destroy(att.id);
                }
            }
        }
        WindowAction.actionType = 'ir.action.window';
        Actions.WindowAction = WindowAction;
        Katrid.Actions.registry[WindowAction.actionType] = WindowAction;
    })(Actions = Katrid.Actions || (Katrid.Actions = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    const _isMobile = function isMobile() {
        var check = false;
        (function (a) {
            if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4)))
                check = true;
        })(navigator.userAgent || navigator.vendor);
        return check;
    }();
    Katrid.settings = {
        additionalModules: [],
        server: '',
        ui: {
            isMobile: _isMobile,
            dateInputMask: true,
            defaultView: 'list',
            goToDefaultViewAfterCancelInsert: true,
            goToDefaultViewAfterCancelEdit: false,
            horizontalForms: true
        },
        services: {
            choicesPageLimit: 10
        },
        speech: {
            enabled: false
        }
    };
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        class Loader {
            constructor(templateCache) {
                this.$cache = templateCache;
            }
            getSource(name) {
                return {
                    src: this.$cache.get(name),
                    path: name,
                    noCache: false,
                };
            }
        }
        Forms.Loader = Loader;
        class Templates {
            constructor(app, templates) {
                this.app = app;
                Templates.env = new nunjucks.Environment(new Loader(app.$templateCache), { autoescape: false });
                let oldGet = app.$templateCache.get;
                app.$templateCache.get = (name) => {
                    return this.prepare(name, oldGet.call(this, name));
                };
                this.loadTemplates(app.$templateCache, templates);
                for (let [k, v] of Object.entries(Templates.PRE_LOADED_TEMPLATES))
                    app.$templateCache.put(k, v);
            }
            prepare(name, templ) {
                if (_.isUndefined(templ))
                    throw Error('Template not found: ' + name);
                if (templ.tagName === 'SCRIPT')
                    return templ.innerHTML;
                return templ;
            }
            compileTemplate(base, templ) {
                let el = $(base);
                templ = $(templ.innerHTML);
                for (let child of Array.from(templ))
                    if (child.tagName === 'JQUERY') {
                        let $child = $(child);
                        let sel = $child.attr('selector');
                        let op = $child.attr('operation');
                        if (sel)
                            sel = el.find(sel);
                        else
                            sel = el;
                        sel[op]($child[0].innerHTML);
                    }
                return el[0].innerHTML;
            }
            loadTemplates(templateCache, res) {
                let templateLst = {};
                let readTemplates = (el) => {
                    if (el.tagName === 'TEMPLATES')
                        Array.from(el.children).map(readTemplates);
                    else if (el.tagName === 'SCRIPT') {
                        templateLst[el.id] = el.innerHTML;
                    }
                };
                let preProcess = (el) => {
                    if (el.tagName === 'TEMPLATES')
                        Array.from(el.children).map(preProcess);
                    else if (el.tagName === 'SCRIPT') {
                        let base = el.getAttribute('extends');
                        let id = el.getAttribute('id') || base;
                        if (base) {
                            el = templateLst[base] + el;
                        }
                        else
                            id = el.id;
                        templateCache.put(id, el);
                    }
                };
                let parser = new DOMParser();
                let doc = parser.parseFromString(res, 'text/html');
                let root = doc.firstChild.childNodes[1].firstChild;
                readTemplates(root);
                preProcess(root);
            }
        }
        Templates.PRE_LOADED_TEMPLATES = {};
        Forms.Templates = Templates;
        function registerTemplate(name, tmpl) {
            Templates.PRE_LOADED_TEMPLATES[name] = tmpl;
        }
        Forms.registerTemplate = registerTemplate;
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Core;
    (function (Core) {
        class Menu {
            constructor(app) {
                this.app = app;
                $('.menu-item-action')
                    .on('click', (event) => {
                    event.preventDefault();
                    let target = event.target;
                    this.actionClick(target.getAttribute('href'));
                    let dm = target.closest('.dropdown-menu');
                    if (dm)
                        dm.style.display = 'none';
                });
                $('li.nav-item.dropdown').on('mouseenter', function () {
                    this.querySelectorAll('.dropdown-menu').forEach((el) => el.removeAttribute('style'));
                });
            }
            actionClick(hash) {
                this.app.loadPage(hash, true);
            }
        }
        Core.Menu = Menu;
        class WebApplication {
            constructor(opts) {
                Katrid.app = this;
                for (let entry of Object.entries(Katrid.customElementsRegistry))
                    customElements.define(entry[0], entry[1]);
                this.menu = new Menu(this);
                this.actionManager = new Katrid.Actions.ActionManager();
                this.title = opts.title;
                this.plugins = [
                    'ui.katrid',
                    'ngSanitize',
                ];
                let self = this;
                $(Katrid).on('app.ready', () => {
                    let loadingTimeout, overlayTimeout;
                    let loadingMsg = $('#loading-msg').hide();
                    let overlay = $('#overlay').hide();
                    document.addEventListener('ajax.start', (evt) => {
                        clearTimeout(loadingTimeout);
                        clearTimeout(overlayTimeout);
                        loadingTimeout = setTimeout(() => loadingMsg.show(), 400);
                        overlayTimeout = setTimeout(() => {
                            loadingMsg.hide();
                            overlay.show();
                        }, 4000);
                    });
                    document.addEventListener('ajax.stop', () => {
                        clearTimeout(loadingTimeout);
                        clearTimeout(overlayTimeout);
                        loadingMsg.hide();
                        overlay.hide();
                    });
                    $(document).ajaxStart(function () {
                        loadingTimeout = setTimeout(() => loadingMsg.show(), 400);
                        overlayTimeout = setTimeout(() => {
                            loadingMsg.hide();
                            overlay.show();
                        }, 2500);
                        console.log('ajaxstop');
                    })
                        .ajaxStop(function () {
                        clearTimeout(loadingTimeout);
                        clearTimeout(overlayTimeout);
                        loadingMsg.hide();
                        overlay.hide();
                    });
                    $('a.module-selector')
                        .on('click', function (event) {
                        event.preventDefault();
                        let item = $(this);
                        let params = {};
                        params.menu_id = item.data('menu-id');
                        Katrid.app.actionManager.clear();
                        self.loadPage(item.attr('href'));
                    })
                        .each(function (idx, el) {
                        let $el = $(el);
                        let params = {};
                        params.menu_id = $el.data('menu-id');
                        params.action = $(`.menu-item-action[data-parent-id="${params.menu_id}"]:first`).data('action-id');
                        $el.attr('href', '#/app/?' + $.param(params));
                    });
                    if (location.hash === '')
                        $('a.module-selector:first').trigger('click');
                    else
                        this.loadPage(location.hash);
                });
                window.addEventListener('hashchange', (event) => {
                    this.loadPage(location.hash);
                });
                fetch(opts.templates || '/web/js/templates/')
                    .then((res) => res.text())
                    .then((templates) => {
                    if (templates)
                        templates = '<templates>' + templates + '</templates>';
                    this.ngApp = angular.module('katridApp', this.plugins)
                        .run(['$templateCache', ($templateCache) => {
                            this.$templateCache = $templateCache;
                            Katrid.Forms.templates = new Katrid.Forms.Templates(this, templates);
                        }])
                        .config(['$locationProvider', '$interpolateProvider', function ($locationProvider, $interpolateProvider) {
                            $locationProvider.hashPrefix('');
                            $interpolateProvider.startSymbol('${');
                            $interpolateProvider.endSymbol('}');
                        }]);
                    this.ngApp.controller('AppController', ['$scope', '$compile', '$location', function ($scope, $compile, $location) {
                            Katrid.Core.$compile = $compile;
                            Katrid.app.$scope = $scope;
                            Katrid.app.$location = $location;
                            $scope._ = _;
                            Katrid.app.$element = $('#katrid-action-view');
                            $(Katrid).trigger('app.ready', [Katrid.app]);
                        }]);
                    this.ngApp.controller('ActionController', ['$scope', function ($scope) {
                        }]);
                    Katrid.Core.plugins.init(this);
                    $(this).trigger('loaded', [Katrid.app]);
                });
            }
            static bootstrap(opts) {
                let app = new WebApplication(opts);
                $(app).on('loaded', function () {
                    angular.element(function () {
                        angular.bootstrap(document, ['katridApp']);
                    });
                });
                return app;
            }
            async loadPage(hash, reset) {
                let evt = $.Event('hashchange');
                $(this).trigger(evt, [hash, reset]);
                if (!evt.isPropagationStopped()) {
                    this.$scope.currentMenu = '';
                    if (hash.startsWith('#/app/?'))
                        hash = hash.split('#/app/?')[1];
                    let _hash = new URLSearchParams(hash);
                    let params = {};
                    for (let [k, v] of _hash.entries())
                        params[k] = v;
                    if (params.menu_id)
                        $('a.module-selector');
                    if (!this.$scope.$parent.currentMenu || (params.menu_id && (this.$scope.$parent.currentMenu.id != params.menu_id))) {
                        this.$scope.$parent.currentMenu = {
                            id: params.menu_id,
                            name: $(`.module-selector[data-menu-id="${params.menu_id}"]`).text()
                        };
                    }
                    if (('action' in params) || ('model' in params))
                        await this.actionManager.onHashChange(params, reset);
                }
            }
            setContent(html, scope) {
                this.$element.empty();
                html = Katrid.Core.$compile(html)(scope || this.$scope);
                this.$element.append(html);
            }
            getTemplate(tpl, context) {
                let text = this.$templateCache.get(tpl);
                if (tpl.endsWith('jinja2')) {
                    let ctx = {
                        _,
                        window,
                    };
                    if (context)
                        Object.assign(ctx, context);
                    return Katrid.Forms.Templates.env.render(tpl, ctx);
                }
                else if (tpl.endsWith('pug')) {
                    text = text(context);
                }
                return text;
            }
            get context() {
                return this.actionManager.context;
            }
        }
        Core.WebApplication = WebApplication;
        angular.module('basicApp', [])
            .controller('LoginController', ['$scope', function ($scope) {
                $scope.login = async (username, password, multidb, db) => {
                    let next = new URLSearchParams(window.location.search).get('next');
                    let res;
                    if (multidb)
                        res = await Katrid.Services.post('/web/db/', { db });
                    if ((multidb && res.redirect) || !multidb) {
                        res = await Katrid.Services.post('/web/login/', { username, password, next });
                        if (res.error) {
                            $scope.messages = [{ type: 'danger', message: res.message }];
                            $scope.$apply();
                        }
                        else {
                            $scope.messages = [{ type: 'success', message: res.message }];
                            $scope.$apply();
                            setTimeout(() => window.location.href = res.redirect);
                        }
                    }
                };
            }]);
    })(Core = Katrid.Core || (Katrid.Core = {}));
})(Katrid || (Katrid = {}));
(function (Katrid) {
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Core;
    (function (Core) {
        _.emptyText = '--';
        class LocalSettings {
            static init() {
                Katrid.localSettings = new LocalSettings();
            }
            constructor() {
            }
            get searchMenuVisible() {
                return parseInt(localStorage.searchMenuVisible) === 1;
            }
            set searchMenuVisible(value) {
                localStorage.searchMenuVisible = value ? 1 : 0;
            }
        }
        Core.LocalSettings = LocalSettings;
        Core.plugins = {
            callbacks: [],
            init(app) {
                for (let cb of this.callbacks)
                    cb(app);
            },
            register(callback) {
                this.callbacks.push(callback);
            }
        };
        function setContent(content, scope) {
        }
        Core.setContent = setContent;
    })(Core = Katrid.Core || (Katrid.Core = {}));
})(Katrid || (Katrid = {}));
(function (Katrid) {
    Katrid.customElementsRegistry = {};
    function define(name, constructor) {
        Katrid.customElementsRegistry[name] = constructor;
    }
    Katrid.define = define;
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Data;
    (function (Data) {
        class Connection {
            constructor(name) {
                Katrid.Data.connections[name] = this;
                if (!Katrid.Data.connection)
                    Katrid.Data.connection = this;
            }
        }
        class Adapter {
        }
        class MemoryAdaper extends Adapter {
        }
        Data.connections = {};
        Data.connection = null;
        Data.defaultConnection = 'default';
    })(Data = Katrid.Data || (Katrid.Data = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Data;
    (function (Data) {
        let DataSourceState;
        (function (DataSourceState) {
            DataSourceState[DataSourceState["inserting"] = 0] = "inserting";
            DataSourceState[DataSourceState["browsing"] = 1] = "browsing";
            DataSourceState[DataSourceState["editing"] = 2] = "editing";
            DataSourceState[DataSourceState["loading"] = 3] = "loading";
            DataSourceState[DataSourceState["inactive"] = 4] = "inactive";
        })(DataSourceState = Data.DataSourceState || (Data.DataSourceState = {}));
        let DEFAULT_REQUEST_INTERVAL = 300;
        class DataSource {
            constructor(config) {
                this.$modifiedRecords = [];
                this.refreshInterval = 1000;
                this.readonly = false;
                this.$modifiedRecords = [];
                this.scope = config.scope;
                this.action = config.action;
                this._model = config.model;
                this.field = config.field;
                this._recordIndex = 0;
                this.recordCount = null;
                this.loading = false;
                this.loadingRecord = false;
                this._masterSource = null;
                this.masterSource = config.master;
                this._pageIndex = 0;
                this.pageLimit = config.pageLimit || 100;
                this.offset = 0;
                this.offsetLimit = 0;
                this.requestInterval = DEFAULT_REQUEST_INTERVAL;
                this.pendingOperation = null;
                this.pendingRequest = false;
                this.children = [];
                this.modifiedData = null;
                this.uploading = 0;
                this._state = null;
                this.fieldWatchers = [];
                this._pendingChanges = false;
                this.recordId = null;
                this.scope.$fieldLog = {};
                this._records = [];
                this.pendingPromises = [];
            }
            get pageIndex() {
                return this._pageIndex;
            }
            set pageIndex(page) {
                this._pageIndex = page;
                console.log('goto page', page);
                this.search(this._params, page, this._fields, DEFAULT_REQUEST_INTERVAL);
            }
            get fields() {
                return this.scope.view.fields;
            }
            get loadingAction() {
                return this._loadingAction;
            }
            set loadingAction(v) {
                if (v)
                    this.requestInterval = 0;
                else
                    this.requestInterval = DEFAULT_REQUEST_INTERVAL;
                this._loadingAction = v;
            }
            async cancel() {
                if (!this.changing)
                    return;
                this._recordIndex = null;
                this._pendingChanges = false;
                if (this.state === DataSourceState.editing)
                    await this.refresh();
                else if (this.action)
                    this.action.switchView('list');
                this.state = DataSourceState.browsing;
                this.scope.$emit('afterCancel', this);
            }
            _createRecord(obj) {
                let rec = Data.createRecord(obj, this);
                rec.$record.onFieldChange = this._onFieldChange;
                return rec;
            }
            async copy(id) {
                let res = await this.model.copy(id);
                this.setRecord({});
                await this.insert();
                setTimeout(() => {
                    clearTimeout(this.pendingOperation);
                    console.log('set value 2');
                    this.setValues(res);
                }, this.requestInterval);
                return res;
            }
            findById(id) {
                for (let rec of this._records)
                    if (rec.id === id)
                        return rec;
                return null;
            }
            $removeById(id) {
                let i = 0;
                for (let rec of this._records) {
                    if (rec.id === id) {
                        this._records.splice(i, 1);
                        return rec;
                    }
                    i++;
                }
                return null;
            }
            hasKey(id) {
                return this.findById(id) !== null;
            }
            refresh(data) {
                let r;
                if (data === true)
                    r = this.search(this._params, this._page);
                else if (data) {
                    r = this.get(data[0]);
                }
                else if (this.record && this.record.id) {
                    r = this.get(this.record.id);
                }
                r.then(() => {
                });
                return r;
            }
            _validateForm(elForm, form, errorMsgs) {
                let elfield;
                for (let errorType in form.$error)
                    if (errorType === 'required')
                        for (let child of Array.from(form.$error[errorType])) {
                            if (child.$name.startsWith('grid-row-form'))
                                elfield = this._validateForm(elForm.find('#' + child.$name), child, errorMsgs);
                            else {
                                elfield = elForm.find(`.form-field[name="${child.$name}"]`);
                                elfield.addClass('ng-touched');
                                let scope = angular.element(elForm).scope();
                                const field = scope.view.fields[child.$name];
                                errorMsgs.push(`<span>${field.caption}</span><ul><li>${Katrid.i18n.gettext('This field cannot be empty.')}</li></ul>`);
                            }
                        }
                    else
                        console.log(form.$error[errorType]);
                return elfield;
            }
            validate(raiseError = true) {
                if (this.action.form && this.action.form.$invalid) {
                    let elfield;
                    let errors = [];
                    let s = `<span>${Katrid.i18n.gettext('The following fields are invalid:')}</span><hr>`;
                    const el = this.scope.formElement;
                    elfield = this._validateForm(el, this.scope.form, errors);
                    Katrid.UI.uiKatrid.setFocus(elfield);
                    s += errors.join('');
                    Katrid.Forms.Dialogs.Alerts.error(s);
                    if (raiseError)
                        throw Error('Error validating form: ' + s);
                    return false;
                }
                return true;
            }
            indexOf(obj) {
                if (this._records)
                    return this._records.indexOf(this.findById(obj.id));
            }
            search(params, page, fields, timeout) {
                let master = this.masterSource;
                this.pendingPromises = [];
                this._params = params;
                this._page = page;
                this._fields = fields;
                this._clearTimeout();
                this.pendingRequest = true;
                this.loading = true;
                page = page || 1;
                this._pageIndex = page;
                let domain;
                if (this.action && this.action.info)
                    domain = this.action.info.domain;
                if (domain) {
                    domain = JSON.parse(domain);
                }
                if (_.isObject(fields))
                    fields = Object.keys(fields);
                params = {
                    count: true,
                    page,
                    where: params,
                    fields,
                    domain,
                    limit: this.pageLimit,
                };
                return new Promise((resolve, reject) => {
                    let controller = new AbortController();
                    let req = () => {
                        this.model.search(params, null, { signal: controller.signal })
                            .catch((res) => {
                            return reject(res);
                        })
                            .then((res) => {
                            if (this.pageIndex > 1) {
                                this.offset = ((this.pageIndex - 1) * this.pageLimit) + 1;
                            }
                            else {
                                this.offset = 1;
                            }
                            this.scope.$apply(() => {
                                if (res.count != null)
                                    this.recordCount = res.count;
                                let data = res.data;
                                this.rawData = data;
                                if (this.readonly)
                                    this._records = data;
                                else
                                    this._records = data.map((obj) => this._createRecord(obj));
                                this.scope.records = this._records;
                                if (this.pageIndex === 1) {
                                    return this.offsetLimit = this._records.length;
                                }
                                else {
                                    return this.offsetLimit = (this.offset + this._records.length) - 1;
                                }
                            });
                            return resolve(res);
                        })
                            .finally(() => {
                            this.pendingRequest = false;
                        });
                    };
                    this.pendingPromises.push(controller);
                    timeout = 0;
                    if (((this.requestInterval > 0) || timeout) && (timeout !== false))
                        this.pendingOperation = setTimeout(req, timeout || this.requestInterval);
                    else
                        req();
                });
            }
            async groupBy(group, params) {
                this._params = [];
                console.log('group by', group, params);
                if (!group || !group.length) {
                    this.groups = [];
                    this.action.groups = null;
                    this.scope.groups = null;
                    this.search(params);
                    return;
                }
                this.scope.action.groups = group;
                this.scope.groupings = [];
                this.groups = group;
                this.scope.groups = await this._loadGroup(group, 0, params);
                return this.scope.$apply();
            }
            async _loadGroup(group, index, params, parent) {
                let rows = [];
                if (!params)
                    params = [];
                if (parent && parent.$params)
                    params = params.concat(parent.$params);
                let res = await this.model.groupBy([group[index]], params);
                const groupName = group[index];
                for (let r of res) {
                    let s = r[groupName];
                    let paramValue;
                    if ($.isArray(s)) {
                        paramValue = s[0];
                        s = s[1];
                    }
                    else {
                        paramValue = s;
                    }
                    r.__str__ = s;
                    r.$expanded = false;
                    r.$group = groupName;
                    r.$params = [];
                    if (parent)
                        r.$params = r.$params.concat(parent.$params);
                    let params = {};
                    params[groupName] = paramValue;
                    r.$params.push(params);
                    r.$level = index;
                    r.$hasChildren = true;
                    rows.push(r);
                }
                return rows;
            }
            goto(index) {
                return this.recordIndex = index;
            }
            moveBy(index) {
                const newIndex = (this._recordIndex + index);
                if ((newIndex > -1) && (newIndex < this._records.length))
                    this.recordIndex = newIndex;
            }
            _clearTimeout() {
                this.loading = false;
                this.loadingRecord = false;
                this._canceled = true;
                this.pendingRequest = false;
                clearTimeout(this.pendingOperation);
                for (let controller of this.pendingPromises)
                    try {
                        controller.abort();
                    }
                    catch { }
                this.pendingPromises = [];
            }
            set masterSource(master) {
                this._masterSource = master;
                if (master)
                    master.children.push(this);
            }
            get masterSource() {
                return this._masterSource;
            }
            applyModifiedData(form, element, record) {
                const data = this.getModifiedData(form, element, record);
                const _id = _.hash(record);
                if (data) {
                    let ds = this.modifiedData;
                    if ((ds == null)) {
                        ds = {};
                    }
                    let obj = ds[_id];
                    if (!obj) {
                        obj = {};
                        ds[_id] = obj;
                    }
                    for (let attr in data) {
                        let v = data[attr];
                        obj[attr] = v;
                    }
                    this.modifiedData = ds;
                    this.masterSource.scope.form.$setDirty();
                }
                return data;
            }
            getNestedData() {
                let ret = {};
                for (let child of this.children)
                    if (child.$modifiedRecords.length) {
                        let res = [];
                        let deleted = [];
                        for (let rec of child.$modifiedRecords) {
                            if (rec.$deleted) {
                                deleted.push(rec);
                                if ((rec.id !== null) && (rec.id !== undefined))
                                    res.push({ id: rec.id, action: 'DESTROY' });
                            }
                        }
                        for (let rec of child.$modifiedRecords) {
                            console.log(rec.$modified, rec.$modifiedData);
                            if (rec.$modifiedData && !rec.$deleted && rec.$modified && (deleted.indexOf(rec) === -1)) {
                                let data = this._getModified(rec.$modifiedData);
                                if (rec.id)
                                    data['id'] = rec.id;
                                jQuery.extend(data, child.getNestedData());
                                if ((rec.id === null) || (rec.id === undefined))
                                    res.push({
                                        action: 'CREATE',
                                        values: data,
                                    });
                                else if ((rec.id !== null) && (rec.id !== undefined))
                                    res.push({
                                        action: 'UPDATE',
                                        values: data,
                                    });
                            }
                        }
                        if (Object.keys(res).length > 0)
                            ret[child.fieldName] = res;
                    }
                return ret;
            }
            save(autoRefresh = true) {
                for (let child of this.children)
                    if (child.changing)
                        child.flush();
                const el = this.action.$form;
                if (this.validate()) {
                    const data = this.record.$record.serialize();
                    console.log(data);
                    let beforeSubmit = el.attr('before-submit');
                    if (beforeSubmit)
                        beforeSubmit = this.scope.$eval(beforeSubmit);
                    if (data) {
                        this.uploading++;
                        return this.model.write([data])
                            .then((res) => {
                            if (this.action && this.action.viewType && (this.action.viewType === 'form'))
                                Katrid.app.$location.search('id', res[0]);
                            if (this.action.form) {
                                this.action.form.$setPristine();
                                this.action.form.$setUntouched();
                            }
                            this._pendingChanges = false;
                            this.state = DataSourceState.browsing;
                            if (autoRefresh)
                                return this.refresh(res);
                            else
                                return res;
                        })
                            .catch((error) => {
                            let s = `<span>${Katrid.i18n.gettext('The following fields are invalid:')}<hr></span>`;
                            if (error.message)
                                s = error.message;
                            else if (error.messages) {
                                let elfield;
                                for (let fld of Object.keys(error.messages)) {
                                    const msgs = error.messages[fld];
                                    let field;
                                    if (fld.indexOf('.') > -1) {
                                        let sfld = fld.split('.');
                                        let subField = sfld[1];
                                        for (let child of this.children)
                                            if (child.scope.fieldName === sfld[0]) {
                                                field = child.scope.view.fields[subField];
                                            }
                                    }
                                    else
                                        field = this.scope.view.fields[fld];
                                    console.log('field invalid', field);
                                    if (!field || !field.name)
                                        continue;
                                    elfield = el.find(`.form-field[name="${field.name}"]`);
                                    elfield.addClass('ng-invalid ng-touched');
                                    s += `<strong>${field.caption}</strong><ul>`;
                                    for (let msg of msgs) {
                                        s += `<li>${msg}</li>`;
                                    }
                                    s += '</ul>';
                                }
                                if (elfield)
                                    elfield.focus();
                            }
                            Katrid.Forms.Dialogs.Alerts.error(s);
                            throw new Error(s);
                        })
                            .finally(() => this.scope.$apply(() => this.uploading--));
                    }
                    else
                        Katrid.Forms.Dialogs.Alerts.warn(Katrid.i18n.gettext('No pending changes'));
                }
            }
            async delete(sel) {
                await this.model.destroy(sel);
            }
            _getNested(recs) {
                let res = [];
                if (recs.$deleted && recs.$deleted.recs.length)
                    for (let rec of recs.$deleted.recs)
                        res.push({ id: rec.id, action: 'DESTROY' });
                let vals;
                if (recs.recs.length)
                    for (let rec of recs.recs)
                        if (rec) {
                            vals = {};
                            if (rec.$created)
                                vals = {
                                    action: 'CREATE',
                                    values: this._getModified(rec.$modifiedData)
                                };
                            else if (rec.$modified) {
                                vals = {
                                    action: 'UPDATE',
                                    values: this._getModified(rec.$modifiedData)
                                };
                                vals.values.id = rec.id;
                            }
                            else
                                continue;
                            res.push(vals);
                        }
                return res;
            }
            _getModified(data) {
                let res = {};
                if (data)
                    for (let [k, v] of Object.entries(data))
                        if (v instanceof Katrid.Data.SubRecords) {
                            res[k] = this._getNested(v);
                        }
                        else
                            res[k] = v;
                return res;
            }
            getModifiedData(form, element, record) {
                let data = {};
                if (record.$modified)
                    jQuery.extend(data, this._getModified(record.$modifiedData));
                if (this.record.id)
                    data['id'] = record.id;
                return data;
            }
            get(id, timeout, apply = true, index = false) {
                this._clearTimeout();
                this.state = DataSourceState.loading;
                this.loadingRecord = true;
                console.log('get by id', id);
                return new Promise((resolve, reject) => {
                    const _get = () => {
                        let controller = new AbortController();
                        this.pendingPromises.push(controller);
                        return this.model.getById(id, { signal: controller.signal })
                            .catch((err) => {
                            if (err.name === 'AbortError')
                                return reject();
                            return reject(err);
                        })
                            .then((res) => {
                            if (!res)
                                return;
                            if (this.state === DataSourceState.loading)
                                this.state = DataSourceState.browsing;
                            else if (this.state === DataSourceState.inserting)
                                return;
                            this.record = res.data[0];
                            if (index !== false)
                                this._records[index] = this.record;
                            return resolve(this.record);
                        })
                            .finally(() => {
                            this.loadingRecord = false;
                            if (apply)
                                return this.scope.$apply();
                        });
                    };
                    if (!timeout && !this.requestInterval)
                        return _get();
                    else
                        this.pendingOperation = setTimeout(_get, timeout || this.requestInterval);
                });
            }
            get defaultValues() {
                return;
            }
            set defaultValues(values) {
                for (let [k, v] of Object.entries(values)) {
                    if (_.isObject(v) && (k in this.fields)) {
                        this.fields[k].defaultValue = v;
                    }
                }
            }
            async insert(loadDefaults = true, defaultValues, kwargs) {
                this._clearTimeout();
                for (let child of this.children)
                    child._clearTimeout();
                let rec = this._createRecord(null);
                let oldRecs = this._records;
                this.record = rec;
                this._records = oldRecs;
                let res;
                for (let child of this.children)
                    child.scope.records = [];
                if (loadDefaults) {
                    if (!kwargs)
                        kwargs = {};
                    kwargs.context = this.action.context;
                    let controller = new AbortController();
                    this.pendingPromises.push(controller);
                    res = await this.model.getDefaults(kwargs, { signal: controller.signal });
                }
                const urlParams = new URLSearchParams();
                this.state = DataSourceState.inserting;
                this.scope.record.record_name = Katrid.i18n.gettext('(New)');
                let defaults = {};
                if (this.masterSource && this.field && this.field.defaultValue)
                    Object.assign(defaults, this.field.defaultValue);
                for (let v of Object.values(this.fields))
                    if (v.defaultValue)
                        defaults[v.name] = v.defaultValue;
                if (this.scope.ngDefaultValues)
                    Object.assign(defaults, this.scope.$eval(this.scope.ngDefaultValues));
                if (this.action.context && this.action.context.default_values)
                    Object.assign(defaults, this.action.context.default_values);
                if (defaultValues)
                    Object.assign(defaults, defaultValues);
                if (res)
                    Object.assign(defaults, res);
                for (let [k, v] of Object.entries(defaults))
                    if (_.isFunction(v)) {
                        v = v(defaults, this);
                        if (!_.isUndefined(v))
                            defaults[k] = v;
                    }
                this.setValues(defaults);
                return this.record;
            }
            setValues(values) {
                Object.entries(values).forEach(([k, v]) => {
                    let fld = this.fields[k];
                    if (fld)
                        fld.fromJSON(v, this);
                    else
                        this.scope.record[k] = v;
                });
                this.scope.$apply();
            }
            edit() {
                this.state = DataSourceState.editing;
            }
            toClientValue(attr, value) {
                const field = this.scope.view.fields[attr];
                if (field) {
                    if (field.type === 'DateTimeField') {
                        value = new Date(value);
                    }
                }
                return value;
            }
            fieldByName(fieldName) {
                if (this.scope.views)
                    return this.scope.views.form.fields[fieldName];
                else
                    return this.scope.view.fields[fieldName];
            }
            set state(state) {
                this._modifiedFields = [];
                this._state = state;
                this.inserting = state === DataSourceState.inserting;
                this.editing = state === DataSourceState.editing;
                this.loading = state === DataSourceState.loading;
                this.changing = [DataSourceState.editing, DataSourceState.inserting].includes(this.state);
            }
            get browsing() {
                return this._state === DataSourceState.browsing;
            }
            childByName(fieldName) {
                for (let child of this.children) {
                    if (child.field.name === fieldName)
                        return child;
                }
            }
            get state() {
                return this._state;
            }
            get record() {
                return this.scope.record;
            }
            set recordId(value) {
                this.scope.recordId = value;
            }
            get recordId() {
                return this.scope.recordId;
            }
            set record(rec) {
                if (!rec.$record)
                    rec = this._createRecord(rec);
                this.scope.record = rec;
                this.recordId = rec.id;
                this._pendingChanges = false;
                if (this.scope.form)
                    this.scope.form.$setPristine();
                if (this.action && this.action.$element)
                    this.action.$element[0].dispatchEvent(new CustomEvent('recordLoaded', { 'detail': { record: rec } }));
                this.childrenNotification(rec);
            }
            setRecord(obj) {
                obj = this._createRecord(obj);
                return obj;
            }
            set records(recs) {
                this._records = recs;
            }
            get records() {
                return this._records;
            }
            next() {
                return this.moveBy(1);
            }
            prior() {
                return this.moveBy(-1);
            }
            nextPage() {
                let p = this.recordCount / this.pageLimit;
                if (Math.floor(p)) {
                    p++;
                }
                if (p > (this.pageIndex + 1)) {
                    this.pageIndex++;
                }
            }
            prevPage() {
                if (this.pageIndex > 1) {
                    this.pageIndex--;
                }
            }
            set recordIndex(index) {
                this._recordIndex = index;
                this.scope.record = this._records[index];
                if (!this.parent)
                    Katrid.app.$location.search('id', this.scope.record.id);
                this.scope.recordId = null;
            }
            get recordIndex() {
                return this._recordIndex;
            }
            addRecord(rec) {
                let scope = this.scope;
                let record = Katrid.Data.createRecord(null, this);
                for (let [k, v] of Object.entries(rec))
                    record[k] = v;
                scope.records.push(record);
                this.parent.record.$record.addChild(record.$record);
            }
            async expandGroup(index, row) {
                let params = [];
                if (this._params)
                    params = params.concat(this._params);
                if (row.$params)
                    params = params.concat(row.$params);
                if (row.$level === (this.groups.length - 1)) {
                    let res = await this.model.search({ params });
                    if (res.data) {
                        row.$children = res.data;
                        this.scope.$apply(() => {
                            this.scope.groups.splice.apply(this.scope.groups, [index + 1, 0].concat(res.data));
                        });
                    }
                    this._records = this._chain();
                }
                else {
                    let rows = await this._loadGroup(this.groups, row.$level + 1, this._params, row);
                    row.$children = rows;
                    this.scope.groups.splice.apply(this.scope.groups, [index + 1, 0].concat(rows));
                    this.scope.$apply();
                }
            }
            collapseGroup(index, row) {
                let collapse = (index, row) => {
                    console.log('collapse', index, row);
                    if (row.$children && row.$children.length && row.$level !== (this.groups.length - 1))
                        row.$children.map((obj) => collapse(this.scope.groups.indexOf(obj), obj));
                    if (row.$children && row.$children.length)
                        this.scope.groups.splice(index + 1, row.$children.length);
                    row.$children = [];
                };
                collapse(index, row);
                this._records = this._chain();
            }
            _chain() {
                let records = [];
                for (let obj of this.scope.groups)
                    if (obj.$hasChildren && obj.$expanded && obj.$children.length)
                        records = records.concat(obj.$children);
                return records;
            }
            _applyResponse(res) {
                if (res) {
                    if (res.value)
                        this.setValues(res.value);
                    this.scope.$apply();
                }
            }
            async dispatchEvent(name, ...args) {
                let res = await this.model.rpc(name, ...args);
                this._applyResponse(res);
            }
            get model() {
                return this._model;
            }
            open() {
                console.log('data source open');
                return this.search({}, 1);
            }
            get parent() {
                return this.masterSource;
            }
            set parent(value) {
                this._masterSource = value;
            }
            $setDirty(field) {
                let form = this.scope.form;
                if (form) {
                    let control = form[field];
                    if (control)
                        control.$setDirty();
                }
                else if (this.action)
                    this.action.setDirty(field);
            }
            destroyChildren() {
                for (let child of this.children)
                    child.scope.$destroy();
                this.children = [];
            }
            childrenNotification(record) {
                for (let child of this.children)
                    child.parentNotification(record);
            }
            async parentNotification(parentRecord) {
                this.records = [];
                this._clearTimeout();
                if (!parentRecord || parentRecord.$created)
                    return;
                this.pendingOperation = setTimeout(async () => {
                    if (parentRecord.id != null) {
                        let data = {};
                        data[this.field.info.field] = parentRecord.id;
                        let res = await this.search(data);
                        parentRecord[this.field.name] = res.data;
                        this.state = Katrid.Data.DataSourceState.browsing;
                    }
                    else {
                        parentRecord[this.field.name] = [];
                        this.action.scope.records = [];
                    }
                    this.action.scope.$apply();
                }, this.refreshInterval);
            }
            destroy() {
                if (this._masterSource)
                    this._masterSource.children.splice(this._masterSource.children.indexOf(this), 1);
            }
            flush(validate) {
                if (validate)
                    this.validate();
                this.record.$record.flush();
                this.state = DataSourceState.browsing;
                for (let child of this.children)
                    child.flush();
            }
            discardChanges() {
                this.record.$record.discard();
            }
            encodeObject(obj) {
                if (_.isArray(obj))
                    return obj.map((v) => this.encodeObject(v));
                else if (_.isObject(obj)) {
                    let r = {};
                    for (let [k, v] of Object.entries(obj))
                        if (!k.startsWith('$'))
                            r[k] = this.encodeObject(v);
                    return r;
                }
                else
                    return obj;
            }
            _onFieldChange(field, newValue, record) {
                console.log('on field change', field.name);
                if (field.name === this._lastFieldName)
                    clearTimeout(this.pendingOperation);
                this._lastFieldName = field.name;
                let fn = () => {
                    console.log('rec', record.pristine);
                    let rec = this.encodeObject(record.pristine);
                    rec[field.name] = newValue;
                    if (this.parent)
                        rec[this.field.info.field] = this.encodeObject(this.parent.record);
                    this.dispatchEvent('field_change_event', [field.name, rec]);
                };
                this.pendingOperation = setTimeout(fn, 50);
            }
        }
        Data.DataSource = DataSource;
        class SearchRequest {
            constructor(fn) {
                this.canceled = false;
                this.fn = fn;
            }
        }
    })(Data = Katrid.Data || (Katrid.Data = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Data;
    (function (Data) {
        var Fields;
        (function (Fields) {
            function toCamelCase(s) {
                s = s.replace(/([^a-zA-Z0-9_\- ])|^[_0-9]+/g, "").trim().toLowerCase();
                s = s.replace(/([ -]+)([a-zA-Z0-9])/g, function (a, b, c) {
                    return c.toUpperCase();
                });
                s = s.replace(/([0-9]+)([a-zA-Z])/g, function (a, b, c) {
                    return b + c.toUpperCase();
                });
                return s;
            }
            class Field {
                constructor(info) {
                    this.visible = true;
                    this.info = info;
                    this.cssClass = info.type;
                    this.caption = info.caption || info.name;
                    this.helpText = this.info.help_text;
                    this.required = this.info.required;
                    this.onChange = this.info.onchange;
                    this.nolabel = false;
                    this.displayChoices = _.object(info.choices);
                    this.choices = info.choices;
                    this.create();
                    this.loadInfo(info);
                }
                create() {
                    this.visible = true;
                    this.emptyText = '--';
                    this.cols = 6;
                    this.readonly = false;
                    if (this.info.choices)
                        this.template = {
                            list: 'view.list.selection-field.jinja2',
                            card: 'view.list.selection-field.jinja2',
                            form: 'view.form.selection-field.jinja2',
                        };
                    else
                        this.template = {
                            list: 'view.list.field.jinja2',
                            card: 'view.list.field.jinja2',
                            form: 'view.form.field.jinja2',
                        };
                }
                loadInfo(info) {
                    if (info.template)
                        this.template = Object.assign(this.template, info.template);
                    if ('cols' in info)
                        this.cols = info.cols;
                    if ('readonly' in info)
                        this.readonly = info.readonly;
                    if ('visible' in info)
                        this.visible = info.visible;
                }
                assign(view, el) {
                    let newField = new this.constructor(this.info);
                    newField.visible = this.visible;
                    newField.readonly = this.readonly;
                    newField.domain = this.domain;
                    newField.view = view;
                    newField.fieldEl = el;
                    newField[newField.view.viewType + 'Render'].apply(newField);
                    return newField;
                }
                get fieldEl() {
                    return this._fieldEl;
                }
                set fieldEl(value) {
                    this._fieldEl = value;
                    if (value) {
                        let newInfo = {};
                        for (let attr of value.attributes)
                            newInfo[attr.name] = value.nodeValue;
                        this.loadInfo(newInfo);
                    }
                }
                formRender(context = {}) {
                    let el = this._fieldEl;
                    let view = this.view;
                    let $el = $(el);
                    let attrs = {};
                    for (let attr of el.attributes) {
                        attrs[attr.name] = attr.value;
                        let camelCase = toCamelCase(attr.name);
                        if (camelCase !== attr.name)
                            attrs[camelCase] = attr.value;
                    }
                    if (attrs.visible === 'false')
                        this.visible = false;
                    else if (attrs.visible === 'true')
                        this.visible = true;
                    let widget = el.getAttribute('widget') || this.widget;
                    if (widget) {
                        let r = document.createElement(widget + '-field');
                        if (r.bind) {
                            r.bind(this);
                            this.el = r;
                            return;
                        }
                    }
                    if (attrs.cols)
                        this.cols = attrs.cols;
                    if (attrs.ngReadonly)
                        this.ngReadonly = attrs.ngReadonly;
                    if (attrs.domain)
                        this.domain = attrs.domain;
                    if (attrs.ngShow)
                        this.ngShow = attrs.ngShow;
                    if (attrs.ngIf)
                        this.ngIf = attrs.ngIf;
                    if (attrs.ngClass)
                        this.ngClass = attrs.ngClass;
                    this.attrs = attrs;
                    context['field'] = this;
                    context['attrs'] = attrs;
                    context['html'] = $el.html();
                    this.el = $(Katrid.app.getTemplate(this.template[view.viewType], context))[0];
                }
                listRender() {
                    let el = this._fieldEl;
                    let view = this.view;
                    let widget = el.getAttribute('widget') || this.widget;
                    if (widget) {
                        let r = document.createElement(widget + '-field');
                        r.bind(this);
                        this.el = r;
                        return;
                    }
                    let attrs = {};
                    for (let attr of el.attributes) {
                        attrs[attr.name] = attr.value;
                        let camelCase = toCamelCase(attr.name);
                        if (camelCase !== attr.name)
                            attrs[camelCase] = attr.value;
                    }
                    if (attrs.cols)
                        this.cols = attrs.cols;
                    if (attrs.ngReadonly)
                        this.ngReadonly = attrs.ngReadonly;
                    if (attrs.domain)
                        this.domain = attrs.domain;
                    if (attrs.visible === 'false')
                        this.visible = false;
                    else if (attrs.visible === 'true')
                        this.visible = true;
                    if (attrs.ngShow)
                        this.ngShow = attrs.ngShow;
                    if (attrs.ngIf)
                        this.ngIf = attrs.ngIf;
                    if (attrs.ngClass)
                        this.ngClass = attrs.ngClass;
                    let context = {
                        field: this,
                        html: $(el).html(),
                        attrs,
                    };
                    let html = Katrid.app.getTemplate(this.template[this.view.viewType], context);
                    let templ = document.createElement('template');
                    templ.innerHTML = html;
                    this.el = templ;
                }
                cardRender() {
                    let el = this._fieldEl;
                    let view = this.view;
                    let widget = el.getAttribute('widget') || this.widget;
                    if (widget) {
                        let r = document.createElement(widget + '-field');
                        r.bind(this);
                        this.el = r;
                        return;
                    }
                }
                render(viewType, el, context) {
                    let attrs = {};
                    for (let attr of el.attributes) {
                        attrs[attr.name] = attr.value;
                        let camelCase = toCamelCase(attr.name);
                        if (camelCase !== attr.name)
                            attrs[camelCase] = attr.value;
                    }
                    if (attrs.cols)
                        this.cols = attrs.cols;
                    if (attrs.ngReadonly)
                        this.ngReadonly = attrs.ngReadonly;
                    if (attrs.domain)
                        this.domain = attrs.domain;
                    if (attrs.visible === 'false')
                        this.visible = false;
                    else if (attrs.visible === 'true')
                        this.visible = true;
                    if (attrs.ngShow)
                        this.ngShow = attrs.ngShow;
                    if (attrs.ngIf)
                        this.ngIf = attrs.ngIf;
                    if (attrs.ngClass)
                        this.ngClass = attrs.ngClass;
                    this.attrs = attrs;
                    context['field'] = this;
                    context['attrs'] = attrs;
                    context['html'] = $(el).html();
                    return Katrid.app.getTemplate(this.template[viewType], context);
                }
                fromJSON(value, dataSource) {
                    dataSource.record[this.name] = value;
                }
                get validAttributes() {
                    return ['name', 'nolabel', 'readonly', 'required'];
                }
                getAttributes(attrs) {
                    let res = {};
                    let validAttrs = this.validAttributes;
                    if (this.ngReadonly)
                        res['ng-readonly'] = this.ngReadonly;
                    else if (this.readonly)
                        res['readonly'] = this.readonly;
                    res['ng-model'] = 'record.' + this.name;
                    if (attrs.ngFieldChange) {
                        res['ng-change'] = attrs.ngFieldChange;
                    }
                    if (this.required)
                        res['required'] = this.required;
                    return res;
                }
                get hasChoices() {
                    return this.info.choices && this.info.choices.length > 0;
                }
                get name() {
                    return this.info.name;
                }
                get model() {
                    return this.info.model;
                }
                get maxLength() {
                    return this.info.max_length;
                }
                get type() {
                    return this.info.type;
                }
                getParamTemplate() {
                    return 'view.param.String';
                }
                createParamWidget() {
                    let templ = this.getParamTemplate();
                    templ = Katrid.app.getTemplate(templ);
                    return $(templ)[0];
                }
                format(value) {
                    return value.toString();
                }
                getParamValue(value) {
                    return value.toString();
                }
                toJSON(val) {
                    return val;
                }
                createWidget(widget, scope, attrs, element) {
                    if (!widget) {
                        if (this.hasChoices)
                            widget = 'SelectionField';
                    }
                    let cls = Katrid.Forms.Widgets.registry[widget || this.type] || Katrid.Forms.Widgets.StringField;
                    return new cls(scope, attrs, this, element);
                }
                validate() {
                }
                get defaultCondition() {
                    return '=';
                }
                isControlVisible(condition) {
                    switch (condition) {
                        case 'is null':
                            return false;
                        case 'is not null':
                            return false;
                    }
                    return true;
                }
            }
            Fields.Field = Field;
            class StringField extends Field {
                constructor(info) {
                    if (!info.cols)
                        info.cols = 3;
                    super(info);
                }
            }
            class PasswordField extends StringField {
                constructor(info) {
                    if (!info.template)
                        info.template = {};
                    if (!info.template.form)
                        info.template.form = 'view.form.password.jinja2';
                    if (!info.template.list)
                        info.template.list = 'view.list.password.jinja2';
                    super(info);
                }
            }
            Fields.PasswordField = PasswordField;
            class BooleanField extends Field {
                constructor(info) {
                    if (!info.cols)
                        info.cols = 3;
                    super(info);
                    this.template.form = 'view.form.boolean-field.jinja2';
                    this.template.list = 'view.list.boolean-field.jinja2';
                    this.template.card = 'view.list.boolean-field.jinja2';
                    this.nolabel = true;
                }
                getParamTemplate() {
                    return 'view.param.Boolean';
                }
            }
            Fields.BooleanField = BooleanField;
            class DateField extends Field {
                constructor(info) {
                    if (!info.cols)
                        info.cols = 3;
                    super(info);
                    this.template.form = 'view.form.date-field.jinja2';
                    this.template.list = 'view.list.date-field.jinja2';
                    this.template.card = 'view.list.date-field.jinja2';
                }
                toJSON(val) {
                    return val;
                }
                getParamTemplate() {
                    return 'view.param.Date';
                }
                format(value) {
                    if (_.isString(value))
                        return moment(value).format(Katrid.i18n.gettext('yyyy-mm-dd').toUpperCase());
                    return '';
                }
                getAttributes(attrs) {
                    let res = super.getAttributes(attrs);
                    res['type'] = 'date';
                    return res;
                }
            }
            class DateTimeField extends DateField {
                constructor(info) {
                    if (!info.cols)
                        info.cols = 3;
                    super(info);
                    this.template.form = 'view.form.datetime-field.jinja2';
                    this.template.list = 'view.list.datetime-field.jinja2';
                }
                getParamTemplate() {
                    return 'view.param.DateTime';
                }
                getAttributes(attrs) {
                    let res = super.getAttributes(attrs);
                    res['type'] = 'datetime-local';
                    return res;
                }
            }
            class TimeField extends DateTimeField {
                constructor(info) {
                    if (!info.cols)
                        info.cols = 3;
                    super(info);
                    this.template.form = 'view.form.time-field.jinja2';
                    this.template.list = 'view.list.time-field.jinja2';
                }
            }
            Fields.TimeField = TimeField;
            class NumericField extends Field {
                constructor(info) {
                    if (!info.cols)
                        info.cols = 3;
                    super(info);
                    this.template.form = 'view.form.decimal-field.jinja2';
                    this.template.list = 'view.list.decimal-field.jinja2';
                }
                fromJSON(value, dataSource) {
                    dataSource.record[this.name] = parseFloat(value);
                }
                toJSON(val) {
                    if (val && _.isString(val))
                        return parseFloat(val);
                    return val;
                }
            }
            Fields.NumericField = NumericField;
            class IntegerField extends Field {
                constructor(info) {
                    if (!info.cols)
                        info.cols = 3;
                    super(info);
                    this.template.form = 'view.form.numeric-field.jinja2';
                    this.template.list = 'view.list.numeric-field.jinja2';
                }
                toJSON(val) {
                    if (val && _.isString(val))
                        return parseInt(val);
                    return val;
                }
                getParamTemplate() {
                    return 'view.param.Integer';
                }
            }
            Fields.IntegerField = IntegerField;
            class FloatField extends NumericField {
            }
            Fields.FloatField = FloatField;
            class DecimalField extends NumericField {
                constructor(info) {
                    super(info);
                    this.decimalPlaces = 2;
                    if (this.info.attrs) {
                        this.decimalPlaces = this.info.attrs.decimal_places || 2;
                    }
                }
            }
            Fields.DecimalField = DecimalField;
            class ForeignKey extends Field {
                constructor(info) {
                    super(info);
                    this.domain = info.domain;
                    Object.assign(this.template, {
                        list: 'view.list.foreignkey.jinja2',
                        card: 'view.list.foreignkey.jinja2',
                        form: 'view.form.foreignkey.jinja2',
                    });
                    if (Katrid.settings.ui.isMobile)
                        this.template.form = 'view.form.autocomplete.jinja2';
                }
                getParamTemplate() {
                    return 'view.param.ForeignKey';
                }
                getParamValue(value) {
                    if (_.isArray(value))
                        return value[0];
                    else if (_.isObject(value))
                        return value.id;
                    return value;
                }
                format(value) {
                    if (_.isArray(value))
                        return value[1];
                    else if (_.isObject(value))
                        return value.text;
                    return value;
                }
                toJSON(val) {
                    if (_.isArray(val))
                        return val[0];
                    return val;
                }
                get validAttributes() {
                    return super.validAttributes.concat(['domain']);
                }
            }
            Fields.ForeignKey = ForeignKey;
            class OneToManyField extends Field {
                create() {
                    super.create();
                    this.template.form = 'view.form.grid.jinja2';
                    this.widget = 'onetomany';
                    this.cols = 12;
                }
                get field() {
                    return this.info.field;
                }
                get validAttributes() {
                    return super.validAttributes.concat(['inline-editor', 'ng-default-values']);
                }
                fromJSON(val, dataSource) {
                    if (val && val instanceof Array) {
                        let child = dataSource.childByName(this.name);
                        val.map((obj) => {
                            if (obj.action === 'CLEAR') {
                                child.scope.records = [];
                                dataSource.record[this.name] = [];
                            }
                            else if (obj.action === 'CREATE') {
                                child.addRecord(obj.values);
                            }
                        });
                        child.scope.$apply();
                    }
                }
            }
            Fields.OneToManyField = OneToManyField;
            class ManyToManyField extends ForeignKey {
                constructor(info) {
                    super(info);
                    if (!info.template || (info.template && !info.template.form))
                        this.template.form = 'view.form.manytomany.jinja2';
                }
                toJSON(val) {
                    if (_.isArray(val))
                        return val.map((obj) => _.isArray(obj) ? obj[0] : obj);
                    else if (_.isString(val))
                        val = val.split(',');
                    return val;
                }
            }
            Fields.ManyToManyField = ManyToManyField;
            class TextField extends StringField {
                constructor(info) {
                    super(info);
                    if (!info.template || (info.template && !info.template.form))
                        this.template.form = 'view.form.text-field.jinja2';
                }
            }
            Fields.TextField = TextField;
            class XmlField extends TextField {
                constructor(info) {
                    super(info);
                    if (!info.template || (info.template && !info.template.form))
                        this.template.form = 'view.form.code-editor.jinja2';
                }
            }
            Fields.XmlField = XmlField;
            class JsonField extends TextField {
                constructor(info) {
                    super(info);
                    if (!info.template || (info.template && !info.template.form))
                        this.template.form = 'view.form.json-field.jinja2';
                }
            }
            Fields.JsonField = JsonField;
            class PythonCodeField extends TextField {
                constructor(info) {
                    super(info);
                    if (!info.template || (info.template && !info.template.form))
                        this.template.form = 'view.form.python-code.jinja2';
                }
            }
            Fields.PythonCodeField = PythonCodeField;
            class ImageField extends Field {
                constructor(info) {
                    if (!info.template)
                        info.template = {};
                    if (!info.template.form)
                        info.template.form = 'view.form.image-field.jinja2';
                    super(info);
                    this.noImageUrl = '/static/web/assets/img/no-image.png';
                }
                getAttributes(attrs) {
                    let res = super.getAttributes(attrs);
                    res.ngSrc = attrs.ngEmptyImage || (attrs.emptyImage && (`'${attrs.emptyImage}`)) || `'${this.noImageUrl}'`;
                    res.ngSrc = `{{ ${res['ng-model']} || ${res.ngSrc} }}`;
                    return res;
                }
                get ngSrc() {
                    let ngSrc = this.attrs.ngEmptyImage || (this.attrs.emptyImage && (`'${this.attrs.emptyImage}`)) || `'${this.noImageUrl}'`;
                    ngSrc = `\${ record.${this.name} || ${ngSrc} }`;
                    return ngSrc;
                }
            }
            Fields.ImageField = ImageField;
            class RadioField extends Field {
            }
            function fromInfo(config) {
                let cls = Katrid.Data.Fields.registry[config.type] || StringField;
                return new cls(config);
            }
            Fields.fromInfo = fromInfo;
            function fromArray(fields) {
                let r = {};
                Object.keys(fields).map((k) => r[k] = fromInfo(fields[k]));
                return r;
            }
            Fields.fromArray = fromArray;
            Fields.registry = {
                Field,
                StringField,
                BooleanField,
                DecimalField,
                NumericField,
                IntegerField,
                TextField,
                ImageField,
                DateField,
                DateTimeField,
                TimeField,
                XmlField,
                JsonField,
                ForeignKey,
                ManyToManyField,
                OneToManyField,
                radio: RadioField,
            };
        })(Fields = Data.Fields || (Data.Fields = {}));
    })(Data = Katrid.Data || (Katrid.Data = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Data;
    (function (Data) {
        let RecordState;
        (function (RecordState) {
            RecordState[RecordState["unmodified"] = 0] = "unmodified";
            RecordState[RecordState["destroyed"] = 1] = "destroyed";
            RecordState[RecordState["created"] = 2] = "created";
            RecordState[RecordState["modified"] = 3] = "modified";
        })(RecordState = Data.RecordState || (Data.RecordState = {}));
        class Record {
            constructor(data, dataSource, state) {
                if (!data)
                    data = this.newRecord();
                this.pristine = data;
                this.data = {};
                this.dataSource = dataSource;
                this.pending = null;
                this.modified = false;
                this.children = [];
                if (this.state !== RecordState.created)
                    this.state = state || RecordState.unmodified;
                this.submitted = false;
                data.$record = this;
            }
            get scope() {
                return this.dataSource.scope;
            }
            get pk() {
                return this.pristine.id;
            }
            addChild(child) {
                if (this.children.indexOf(child) === -1)
                    this.children.push(child);
            }
            newRecord() {
                let rec = {};
                rec.$created = true;
                this.state = RecordState.created;
                return rec;
            }
            delete() {
                if (this.state === RecordState.unmodified) {
                    this.setModified();
                    if (this.parent.children.indexOf(this) === -1)
                        this.parent.children.push(this);
                    this.state = RecordState.destroyed;
                }
                else if (this.parent.children.indexOf(this) > -1) {
                    this.parent.children.splice(this.parent.children.indexOf(this), 1);
                }
            }
            _prepareRecord(rec, parent) {
                console.log('prepare record');
                console.trace();
                return;
                let getValue = (v) => {
                    if (_.isObject(v))
                        return this._prepareRecord(v, rec);
                    else if (_.isArray(v))
                        return v.map((obj) => getValue(obj));
                    return v;
                };
                let res = {};
                for (let [k, v] of Object.entries(rec)) {
                    if (parent && _.isObject(v))
                        continue;
                    res[k] = getValue(v);
                    if (v)
                        console.log(v.constructor.name);
                }
                if (this.dataSource.parent && !parent) {
                    let field = this.dataSource.parent.scope.view.fields[this.dataSource.fieldName]._info.field;
                    res[field] = this.dataSource.parent.record.$record._prepareRecord(this.dataSource.parent.record);
                }
                return res;
            }
            setModified(field) {
                this.modified = true;
                if (field)
                    this.dataSource.$setDirty(field);
                this.dataSource._pendingChanges = true;
            }
            get parent() {
                return this.dataSource.parent && this.dataSource.parent.record.$record;
            }
            compare(oldValue, newValue) {
                if (_.isArray(oldValue) && _.isArray(newValue))
                    return oldValue.join(',') !== newValue.join(',');
                return oldValue != newValue;
            }
            discard() {
                if (this.pending)
                    Object.assign(this.pristine, this.pending);
                this.data = {};
            }
            flush() {
                if (!this.pending)
                    this.pending = {};
                Object.assign(this.pending, this.data);
                this.parent.addChild(this);
            }
            set(propKey, value) {
                let field = this.dataSource.fieldByName(propKey);
                if (field) {
                    if (this.state === RecordState.unmodified)
                        this.state = RecordState.modified;
                    let oldValue = this.pristine[propKey];
                    value = field.toJSON(value);
                    if (this.compare(oldValue, value)) {
                        this.setModified(propKey);
                        this.data[propKey] = value;
                        if (field.onChange) {
                            if (this.onFieldChange)
                                this.onFieldChange.apply(this.dataSource, [field, value, this]);
                        }
                    }
                }
                return true;
            }
            $new() {
                return new Record(this.pristine);
            }
            serialize() {
                let data = {};
                Object.assign(data, this.data);
                for (let child of this.children) {
                    if (!(child.dataSource.field.name in data))
                        data[child.dataSource.field.name] = [];
                    if (child.state === RecordState.created)
                        data[child.dataSource.field.name].push({ action: 'CREATE', values: child.serialize() });
                    else if (child.state === RecordState.modified)
                        data[child.dataSource.field.name].push({ action: 'UPDATE', values: child.serialize() });
                    else if (child.state === RecordState.destroyed)
                        data[child.dataSource.field.name].push({ action: 'DESTROY', id: child.pk });
                }
                if (this.pk)
                    data.id = this.pk;
                return data;
            }
        }
        Data.Record = Record;
        class SubRecords {
            constructor(recs) {
                this.recs = recs;
            }
            append(rec) {
                if (this.recs.indexOf(rec) === -1)
                    this.recs.push(rec);
            }
        }
        Data.SubRecords = SubRecords;
        function createRecord(rec, dataSource) {
            let record = new Record(rec, dataSource);
            if (!rec)
                rec = record.pristine;
            return new Proxy(rec, {
                set(target, propKey, value, receiver) {
                    if (!propKey.startsWith('$$')) {
                        let scope = dataSource.scope;
                        let field = dataSource.fieldByName(propKey);
                        if (!propKey.startsWith('$') && scope && field && !(field instanceof Katrid.Data.Fields.OneToManyField)) {
                            rec.$record.set(propKey, value);
                        }
                    }
                    return Reflect.set(target, propKey, value, receiver);
                }
            });
        }
        Data.createRecord = createRecord;
    })(Data = Katrid.Data || (Katrid.Data = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        class MenuItem {
            constructor(menu, text = null) {
                this.menu = menu;
                this.text = text;
                this.el = document.createElement('div');
            }
            addEventListener(type, listener, options) {
                return this.el.addEventListener(type, listener, options);
            }
            get index() {
                return this.menu.items.indexOf(this);
            }
        }
        Forms.MenuItem = MenuItem;
        class MenuItemSeparator extends MenuItem {
            constructor(menu) {
                super(menu, '-');
            }
        }
        Forms.MenuItemSeparator = MenuItemSeparator;
        class ContextMenu {
            constructor(container = null) {
                this.container = container;
                this.items = [];
                if (!container)
                    this.container = document.body;
            }
            add(item) {
                return this.insert(-1, item);
            }
            insert(index, item) {
                let menuItem;
                if (_.isString(item))
                    menuItem = new MenuItem(this, item);
                else if (item instanceof MenuItem)
                    menuItem = item;
                if (index === -1)
                    this.items.push(menuItem);
                else
                    this.items.splice(index, 0, menuItem);
                return menuItem;
            }
            addSeparator() {
                this.items.push(new MenuItemSeparator(this));
            }
            destroyElement() {
                if (this.el)
                    this.el.remove();
            }
            createElement() {
                this.el = document.createElement('div');
                this.el.classList.add('k-context-menu');
            }
            show(x, y, target = null) {
                this.destroyElement();
                this.createElement();
                this.el.style.left = x + 'px';
                this.el.style.top = y + 'px';
                this.target = target;
                this._visible = true;
                this._eventHook = () => this.close();
                document.addEventListener('mousedown', this._eventHook);
            }
            close() {
                document.removeEventListener('mousedown', this._eventHook);
                this._eventHook = null;
            }
            get visible() {
                return this._visible;
            }
        }
        Forms.ContextMenu = ContextMenu;
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Dialogs;
        (function (Dialogs) {
            class Alerts {
                static success(msg) {
                    return toastr['success'](msg);
                }
                static warn(msg) {
                    return toastr['warning'](msg);
                }
                static info(msg) {
                    return toastr['info'](msg);
                }
                static error(msg) {
                    return toastr['error'](msg);
                }
            }
            Dialogs.Alerts = Alerts;
            class WaitDialog {
                static show() {
                    $('#loading-msg').show();
                }
                static hide() {
                    $('#loading-msg').hide();
                }
            }
            class ExceptionDialog {
                static show(title, msg, traceback) {
                }
            }
        })(Dialogs = Forms.Dialogs || (Forms.Dialogs = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        class BaseField extends HTMLElement {
        }
        Forms.BaseField = BaseField;
        class InputField extends BaseField {
        }
        Forms.InputField = InputField;
        class StringField extends InputField {
        }
        Forms.StringField = StringField;
        class NumericField extends InputField {
        }
        Forms.NumericField = NumericField;
        class BooleanField extends InputField {
        }
        Forms.BooleanField = BooleanField;
        class TextField extends StringField {
        }
        Forms.TextField = TextField;
        class DateField extends InputField {
        }
        Forms.DateField = DateField;
        class DateTimeField extends DateField {
        }
        Forms.DateTimeField = DateTimeField;
        class TimeField extends InputField {
        }
        Forms.TimeField = TimeField;
        class ChoiceField extends InputField {
        }
        Forms.ChoiceField = ChoiceField;
        class AutoCompleteField extends ChoiceField {
        }
        Forms.AutoCompleteField = AutoCompleteField;
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var UI;
    (function (UI) {
        UI.keyCode = {
            BACKSPACE: 8,
            COMMA: 188,
            DELETE: 46,
            DOWN: 40,
            END: 35,
            ENTER: 13,
            ESCAPE: 27,
            HOME: 36,
            LEFT: 37,
            PAGE_DOWN: 34,
            PAGE_UP: 33,
            PERIOD: 190,
            RIGHT: 39,
            SPACE: 32,
            TAB: 9,
            UP: 38
        };
        function toggleFullScreen() {
            if (!document.fullscreenElement) {
                if (document.documentElement.requestFullscreen)
                    document.documentElement.requestFullscreen();
            }
            else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }
        UI.toggleFullScreen = toggleFullScreen;
        UI.uiKatrid = angular.module('ui.katrid', []);
    })(UI = Katrid.UI || (Katrid.UI = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Widgets;
        (function (Widgets) {
            class Widget {
            }
            Widgets.Widget = Widget;
            class Component {
            }
            Widgets.Component = Component;
            let ID = 0;
            function genId() {
                return ++ID;
            }
            Widgets.genId = genId;
            class FieldWidget extends HTMLElement {
                get field() {
                    return this._field;
                }
                set field(value) {
                    this._field = value;
                    this._fieldEl = value.fieldEl;
                    this.fieldName = value.name;
                    this.view = value.view;
                }
                bind(field) {
                    this.field = field;
                }
                connectedCallback() {
                    this.actionView = this.closest('action-view');
                    this._id = ++ID;
                    this.create();
                }
                disconnectedCallback() {
                    this.destroy();
                }
                create() {
                    let cols = this._field.cols || 12;
                    this.classList.add('col-md-' + cols.toString());
                }
                destroy() {
                }
            }
            Widgets.FieldWidget = FieldWidget;
            class InputField extends FieldWidget {
            }
            Widgets.InputField = InputField;
            Widgets.registry = {};
        })(Widgets = Forms.Widgets || (Forms.Widgets = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Views;
        (function (Views) {
            let compileButtons = (container) => {
                let sendFileCounter = 0;
                return container.find('button').each((idx, btn) => {
                    let $btn = $(btn);
                    let type = $btn.attr('type');
                    if (!$btn.attr('type') || ($btn.attr('type') === 'object'))
                        $btn.attr('type', 'button');
                    if (type === 'object') {
                        let sendFile = $btn.attr('send-file');
                        $btn.attr('button-object', $btn.attr('name'));
                        if (_.isUndefined(sendFile)) {
                            $btn.attr('ng-click', `action.formButtonClick(action.selection, '${$btn.attr('name')}', $event.target);$event.stopPropagation();`);
                        }
                        else {
                            let idSendFile = `__send_file_${++sendFileCounter}`;
                            container.append(`<input id="${idSendFile}" type="file" style="display: none" onchange="Katrid.Services.Upload.sendFile('${$btn.attr('name')}', this)"/>`);
                            $btn.attr('send-file', $btn.attr('name'));
                            $btn.attr('onclick', `$('#${idSendFile}').trigger('click')`);
                        }
                    }
                    else if (type === 'tag') {
                        $btn.attr('button-tag', $btn.attr('name'));
                        $btn.attr('onclick', `Katrid.Actions.ClientAction.tagButtonClick($(this))`);
                    }
                    if (!$btn.attr('class'))
                        $btn.addClass('btn btn-outline-secondary');
                });
            };
            class ClientView {
                constructor(action) {
                    this.action = action;
                }
                get template() {
                    return Katrid.app.getTemplate(this.templateUrl);
                }
                render() {
                    return $(this.template);
                }
            }
            Views.ClientView = ClientView;
            class BaseView {
                constructor(scope) {
                    this.scope = scope;
                }
                render() {
                    return $(Katrid.app.getTemplate(this.templateUrl));
                }
            }
            Views.BaseView = BaseView;
            class ActionView extends BaseView {
                constructor(action, scope, view, content) {
                    super(scope);
                    this.action = action;
                    this.view = view;
                    this.templateUrl = 'view.basic';
                    this.toolbar = true;
                    this.content = content;
                }
                getTemplateContext() {
                    return { content: this.content };
                }
                render() {
                    return sprintf(Katrid.app.getTemplate(this.templateUrl), this.getTemplateContext());
                }
                renderTo(el) {
                    Katrid.Core.setContent(this.render(), this.scope);
                }
            }
            Views.ActionView = ActionView;
            class View extends ActionView {
                getBreadcrumb() {
                    let html = `<ol class="breadcrumb">`;
                    let i = 0;
                    for (let h of Katrid.app.actionManager.actions) {
                        if ((h instanceof Katrid.Actions.WindowAction) && (i === 0 && h.viewModes.length > 1))
                            html += `<li class="breadcrumb-item"><a href="#" ng-click="action.backTo(0, 0)">${h.info.display_name}</a></li>`;
                        i++;
                        if ((h instanceof Katrid.Actions.WindowAction) && (Katrid.app.actionManager.length > i && h.viewType === 'form'))
                            html += `<li class="breadcrumb-item"><a href="#" ng-click="action.backTo(${i - 1}, 'form')">${h.scope.record.display_name}</a></li>`;
                    }
                    if (this.type === 'form')
                        html += `<li class="breadcrumb-item">{{ self.display_name }}</li>`;
                    return html + '</ol>';
                }
                render() {
                    return sprintf(Katrid.app.$templateCache.get(this.templateUrl), { content: this.content });
                }
                getViewButtons() {
                    let btns = Object.entries(View.buttons).map((btn) => this.view.viewModes.includes(btn[0]) ? btn[1] : '').join('');
                    if (btns)
                        btns = `<div class="btn-group">${btns}</div>`;
                    return btns;
                }
            }
            View.buttons = {};
            Views.View = View;
            class WindowView {
                constructor(config) {
                    this.config = config;
                    this.action = config.action;
                    this.viewInfo = config.viewInfo;
                    this.templateUrl = null;
                    this.create();
                }
                create() {
                    this.context = {};
                    if (this.config.context)
                        Object.assign(this.context, this.config.context);
                    if (this.config.templateUrl)
                        this.templateUrl = this.config.templateUrl;
                }
                template() {
                    let content = this.viewInfo.content;
                    if (content instanceof HTMLElement)
                        content = content.cloneNode(true);
                    return $(content)[0];
                }
                render(el) {
                    return;
                }
                renderTo(container) {
                    this.el = this.render(container);
                    container.append(this.el);
                }
                get fields() {
                    return this.viewInfo.fields;
                }
                renderField(fieldEl) {
                    let name = fieldEl.getAttribute('name');
                    if (name) {
                        let fld = this.fields[name];
                        if (fld) {
                            let newField = fld.assign(this, fieldEl);
                            if (newField.visible)
                                return newField.el;
                            return null;
                        }
                        else
                            console.error(`Field "${name}" not found`);
                    }
                }
                ready() {
                }
                createHeader(el) {
                    compileButtons($(el));
                    let headerEl = el.querySelector('header');
                    let header = '';
                    if (headerEl) {
                        let statusField = headerEl.querySelector('field[name=status]');
                        if (statusField)
                            statusField.setAttribute('status-field', 'status-field');
                        headerEl.remove();
                        header = headerEl.innerHTML;
                    }
                    return header;
                }
            }
            Views.WindowView = WindowView;
            Katrid.UI.uiKatrid
                .directive('smartForm', () => ({
                restrict: 'A',
                link(scope, el, attrs) {
                    if ('edit' in attrs) {
                        attrs.$observe('edit', (v) => {
                            if (v === 'false')
                                $('.action-view:first').find('.toolbutton-action-edit').hide();
                            else
                                $('.action-view:first').find('.toolbutton-action-edit').show();
                        });
                    }
                }
            }));
            Views.searchModes = ['list', 'card'];
            Views.registry = {};
        })(Views = Forms.Views || (Forms.Views = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Dialogs;
        (function (Dialogs) {
            class Dialog extends Katrid.Forms.Views.BaseView {
                constructor(scope, options) {
                    super(scope);
                    this.templateUrl = 'dialog.base';
                    this.scope.isDialog = true;
                }
                render() {
                    return $(Katrid.app.getTemplate(this.templateUrl).replace('<!-- replace-content -->', this.content));
                }
                show() {
                    if (!this.el) {
                        this.el = $(this.render());
                        this.root = this.el.find('.modal-dialog-body');
                        this.el.find('form').first().addClass('row');
                        this.$compile(this.el)(this.scope);
                    }
                    this.el.modal('show')
                        .on('shown.bs.modal', () => Katrid.UI.uiKatrid.setFocus(this.el.find('.form-field').first()));
                    return this.el;
                }
            }
            Dialogs.Dialog = Dialog;
            class Window extends Dialog {
                constructor(options) {
                    super(options.scope, options);
                    this.scope.parentAction = options.action;
                    this.scope.views = {
                        form: options.view
                    };
                    this.dialogTitle = (options && options.title) || Katrid.i18n.gettext('Create: ');
                    this.scope.view = this.view = options.view;
                    this.scope.model = options.model;
                    this.options = options;
                    this.action = {
                        model: options.model,
                        context: {},
                        saveAndClose: async () => {
                            let data = await this.scope.dataSource.save();
                            this.dialog.modal('hide');
                            this.scope.$emit('saveAndClose', this.scope, data);
                        }
                    };
                    this.scope.action = this.action;
                }
                async createNew() {
                    let field = this.options.field;
                    this.scope.$setDirty = (field) => {
                        const control = this.scope.form[field];
                        if (control) {
                            control.$setDirty();
                        }
                    };
                    let view = this.scope.view;
                    let elScope = this.scope;
                    elScope.views = { form: view };
                    elScope.isDialog = true;
                    let caption = this.dialogTitle;
                    let dataSource = this.action.dataSource = this.scope.dataSource =
                        new Katrid.Data.DataSource({ scope: this.scope, action: this.action, model: this.options.model });
                    let formView = new Katrid.Forms.Views.FormDialog({ action: this.action, viewInfo: this.view, templateUrl: 'view.form.empty.jinja2' });
                    let el = formView.prepare();
                    let form = el.find('form:first');
                    elScope.root = form;
                    this.action.$element = form;
                    form.addClass('row');
                    let dlg = $(Katrid.app.getTemplate('view.form.dialog.jinja2', { caption: this.dialogTitle || view.caption }));
                    dlg[0].action = this.action;
                    dlg.find('.modal-body').append(el);
                    Katrid.Core.$compile(dlg)(this.scope);
                    dlg.modal({ backdrop: 'static' })
                        .on('hidden.bs.modal', function () {
                        $(this).modal('dispose').remove();
                    });
                    this.dialog = dlg;
                    this.scope.form = form.controller('form');
                    this.scope.formElement = form;
                    if (field) {
                        let evt = this.scope.$on('saveAndClose', async (event, targetScope, data) => {
                            if (this.scope === targetScope) {
                                console.log('save and close', data);
                                if (data) {
                                    let d = data = await this.scope.$parent.model.getFieldChoices(field.name, null, { ids: [data.id] });
                                    let vals = {};
                                    let res = d.items[0];
                                    vals[field.name] = res;
                                    this.scope.$parent.action.dataSource.setValues(vals);
                                    if (this.options.sel)
                                        this.options.sel.select2('data', { id: res[0], text: res[1] });
                                }
                                evt();
                            }
                        });
                    }
                    return new Promise(async (resolve, reject) => {
                        setTimeout(async () => {
                            let kwargs, defaultValues;
                            if (this.options) {
                                if (this.options.creationName)
                                    kwargs = { creation_name: name };
                                if (this.options.defaultValues)
                                    defaultValues = this.options.defaultValues;
                            }
                            await dataSource.insert(true, defaultValues, kwargs);
                            console.log('inserting', dataSource);
                            this.scope.$apply();
                            resolve(el);
                        });
                    });
                }
                ;
            }
            Dialogs.Window = Window;
        })(Dialogs = Forms.Dialogs || (Forms.Dialogs = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Views;
        (function (Views) {
            class CustomView extends HTMLElement {
            }
            Views.CustomView = CustomView;
        })(Views = Forms.Views || (Forms.Views = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Views;
        (function (Views) {
            class Card extends Views.WindowView {
                create() {
                    super.create();
                    this.viewType = 'card';
                    this.templateUrl = 'view.card.jinja2';
                    this.action.view = this;
                }
                render(container) {
                    let content = $(this.template());
                    content.children('field').remove();
                    for (let element of content.find('field')) {
                        let el = $(element);
                        let newField = this.renderField(element);
                        if (newField)
                            el.replaceWith(newField);
                        else
                            el.replaceWith(`\$\{ record.${el.attr('name')} }`);
                    }
                    let templ = $(Katrid.app.getTemplate(this.templateUrl, { content: content[0].outerHTML }));
                    return Katrid.Core.$compile(templ)(this.action.scope);
                }
                ready() {
                    setTimeout(() => this.action.dataSource.open().then(() => this.action.scope.$apply()), 500);
                }
            }
            Views.Card = Card;
            Views.registry['card'] = Card;
        })(Views = Forms.Views || (Forms.Views = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Views;
        (function (Views) {
            class FormView extends Views.WindowView {
                create() {
                    super.create();
                    if (!this.templateUrl)
                        this.templateUrl = 'view.form.jinja2';
                    this.viewType = 'form';
                }
                template() {
                    let form = super.template();
                    $(form).find('tabset').tabset();
                    return form;
                }
                prepare(container) {
                    let form = this.template();
                    form.setAttribute('smart-form', 'smart-form');
                    form.classList.add('row');
                    let header = this.createHeader(form);
                    for (let child of form.querySelectorAll('field')) {
                        if (child.hasAttribute('invisible'))
                            continue;
                        let newField = this.renderField(child);
                        if (newField) {
                            child.parentElement.insertBefore(newField, child);
                            child.remove();
                            newField.setAttribute('form-field', 'form-field');
                        }
                    }
                    let context = {};
                    Object.assign(context, this.context);
                    Object.assign(context, {
                        header,
                    });
                    let templ = $(Katrid.app.getTemplate(this.templateUrl, context));
                    templ.find('.template-placeholder').append(form);
                    if (this.action)
                        this.action.$form = templ.find('form:first').first();
                    this.el = templ;
                    return templ;
                }
                render(container) {
                    let templ = this.prepare(container);
                    templ = Katrid.Core.$compile(templ)(this.action.scope);
                    this.action.form = angular.element(this.action.$form).controller('form');
                    templ.addClass('ng-form');
                    return templ;
                }
            }
            Views.FormView = FormView;
            class FormDialog extends FormView {
                get caption() {
                    return this.el.attr('caption');
                }
            }
            Views.FormDialog = FormDialog;
            Views.registry['form'] = FormView;
        })(Views = Forms.Views || (Forms.Views = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Views;
        (function (Views) {
            class List extends Views.WindowView {
                create() {
                    super.create();
                    this.viewType = 'list';
                    this.templateUrl = 'view.list.html';
                    this.action.view = this;
                }
                render(container) {
                    let list = this.template();
                    let context = {};
                    Object.assign(context, this.context);
                    let header = this.createHeader(list);
                    let templ = $(Katrid.app.getTemplate(this.templateUrl));
                    templ.find('header:first').append($(header));
                    templ.find('.template-placeholder').append(list);
                    templ.find('list')
                        .attr('ng-row-click', 'action.listRowClick($index, record, $event)')
                        .attr('list-options', '{"rowSelector": true}').attr('ng-row-click', 'action.listRowClick($index, record, $event)');
                    templ = Katrid.Core.$compile(templ)(this.action.scope);
                    return templ;
                }
                ready() {
                    this.action.dataSource.open();
                }
            }
            Views.List = List;
            Views.registry['list'] = List;
        })(Views = Forms.Views || (Forms.Views = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    Katrid.i18n = {
        languageCode: 'pt-BR',
        formats: {},
        catalog: {},
        initialize(plural, catalog, formats) {
            Katrid.i18n.plural = plural;
            Katrid.i18n.catalog = catalog;
            Katrid.i18n.formats = formats;
            if (plural) {
                Katrid.i18n.pluralidx = function (n) {
                    if (plural instanceof Boolean) {
                        if (plural) {
                            return 1;
                        }
                        else {
                            return 0;
                        }
                    }
                    else {
                        return plural;
                    }
                };
            }
            else {
                Katrid.i18n.pluralidx = function (n) {
                    if (n === 1) {
                        return 0;
                    }
                    else {
                        return 1;
                    }
                };
            }
            _.mixin({
                gettext: Katrid.i18n.gettext,
                sprintf: sprintf,
            });
            return Katrid.i18n.initialized = true;
        },
        merge(catalog) {
            return Array.from(catalog).map((key) => (Katrid.i18n.catalog[key] = catalog[key]));
        },
        gettext(s) {
            const value = Katrid.i18n.catalog[s];
            if (value != null) {
                return value;
            }
            else {
                return s;
            }
        },
        gettext_noop(s) {
            return s;
        },
        ngettext(singular, plural, count) {
            const value = Katrid.i18n.catalog[singular];
            if (value != null) {
                return value[Katrid.i18n.pluralidx(count)];
            }
            else if (count === 1) {
                return singular;
            }
            else {
                return plural;
            }
        },
        pgettext(s) {
            let value = Katrid.i18n.gettext(s);
            if (value.indexOf('\x04') !== -1) {
                value = s;
            }
            return value;
        },
        npgettext(ctx, singular, plural, count) {
            let value = Katrid.i18n.ngettext(ctx + '\x04' + singular, ctx + '\x04' + plural, count);
            if (value.indexOf('\x04') !== -1) {
                value = Katrid.i18n.ngettext(singular, plural, count);
            }
            return value;
        },
        interpolate(fmt, obj, named) {
            if (named) {
                fmt.replace(/%\(\w+\)s/g, match => String(obj[match.slice(2, -2)]));
            }
            else {
                fmt.replace(/%s/g, match => String(obj.shift()));
            }
            return {
                get_format(formatType) {
                    const value = Katrid.i18n.formats[formatType];
                    if (value != null) {
                        return value;
                    }
                    else {
                        return formatType;
                    }
                }
            };
        }
    };
    if (window.KATRID_I18N)
        Katrid.i18n.initialize(KATRID_I18N.plural, KATRID_I18N.catalog, KATRID_I18N.formats);
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Views;
        (function (Views) {
            let conditionsLabels = {
                '=': Katrid.i18n.gettext('Is equal'),
                '!=': Katrid.i18n.gettext('Is different'),
                '>': Katrid.i18n.gettext('Greater-than'),
                '<': Katrid.i18n.gettext('Less-than'),
                'like': Katrid.i18n.gettext('Contains'),
                'range': Katrid.i18n.gettext('Between'),
            };
            let conditionSuffix = {
                '=': '',
                '!=': '__isnot',
                'like': '__icontains',
                'not like': '__not_icontains',
                '>': '__gt',
                '>=': '__gte',
                '<': '__lt',
                '<=': '__lte',
                'in': '__in',
                'not in': '__not_in',
                'range': '__range',
            };
            class SearchQuery {
                constructor(searchView) {
                    this.searchView = searchView;
                    this.items = [];
                    this.groups = [];
                }
                add(item) {
                    if (this.items.includes(item)) {
                        item.facet.addValue(item);
                        item.facet.refresh();
                    }
                    else {
                        this.items.push(item);
                        this.searchView.renderFacets();
                    }
                    if (item instanceof SearchGroup)
                        this.groups.push(item);
                    this.searchView.change();
                }
                loadItem(item) {
                    this.items.push(item);
                    if (item instanceof SearchGroup)
                        this.groups.push(item);
                }
                remove(item) {
                    this.items.splice(this.items.indexOf(item), 1);
                    if (item instanceof SearchGroup) {
                        this.groups.splice(this.groups.indexOf(item), 1);
                    }
                    this.searchView.change();
                }
                getParams() {
                    let r = [];
                    for (let i of this.items)
                        r = r.concat(i.getParamValues());
                    return r;
                }
            }
            class FacetView {
                constructor(item) {
                    this.item = item;
                    this.values = [];
                }
                get separator() {
                    return ` <span class="facet-values-separator">${Katrid.i18n.gettext('or')}</span> `;
                }
                init(item, values) {
                    this.item = item;
                    if (values)
                        this.values = values;
                    else
                        this.values = [{
                                searchString: this.item.getDisplayValue(), value: this.item.value
                            }];
                }
                addValue(value) {
                    return this.values.push(value);
                }
                get caption() {
                    return this.item.caption;
                }
                clear() {
                    this.values = [];
                }
                get templateValue() {
                    console.log(this.values);
                    return (Array.from(this.values).map((s) => s instanceof SearchObject ? s.display : s)).join(this.separator);
                }
                template() {
                    return;
                }
                link(searchView) {
                    const html = $(this.template());
                    this.item.facet = this;
                    this.element = html;
                    const rm = html.find('.facet-remove');
                    rm.click((evt) => searchView.onRemoveItem(evt, this.item));
                    return html;
                }
                render(el) {
                }
                refresh() {
                    return this.element.find('.facet-value').html(this.templateValue);
                }
                load(searchView) {
                    searchView.query.loadItem(this.item);
                    this.render(searchView);
                }
                destroy() {
                    this.clear();
                }
                getParamValues() {
                    const r = [];
                    for (let v of this.values) {
                        r.push(this.item.getParamValue(v));
                    }
                    if (r.length > 1)
                        return [{ 'OR': r }];
                    return r;
                }
            }
            class FacetGroup extends FacetView {
                constructor(...args) {
                    super(args);
                    this.grouping = true;
                }
                clear() {
                    let oldValues = this.values;
                    super.clear();
                    for (let v of oldValues)
                        if (v._ref)
                            v._ref._selected = false;
                }
                get separator() {
                    return ` <span> &gt; </span> `;
                }
                get caption() {
                    return '<span class="fa fa-bars"></span>';
                }
            }
            class SearchItem {
                constructor(view, name, el) {
                    this.view = view;
                    this.name = name;
                    this.el = el;
                }
                getDisplayValue() {
                    if (this.value) {
                        return this.value[1];
                    }
                    return this.searchString;
                }
                getParamValue(name, value) {
                    let r = {};
                    if (_.isArray(value)) {
                        r[name] = value[0];
                    }
                    else {
                        r[name + '__icontains'] = value;
                    }
                    return r;
                }
                _doChange() {
                    this.view.update();
                }
            }
            class SearchFilter extends SearchItem {
                constructor(view, name, caption, domain, group, el) {
                    super(view, name, el);
                    this.group = group;
                    this.caption = caption;
                    if (_.isString(domain))
                        domain = JSON.parse(domain.replace(/'/g, '"'));
                    this.domain = domain;
                    this._selected = false;
                }
                static fromItem(view, el, group) {
                    return new SearchFilter(view, el.attr('name'), el.attr('caption') || el.attr('label'), el.attr('domain'), group, el);
                }
                toString() {
                    return this.caption;
                }
                toggle() {
                    this.selected = !this.selected;
                }
                get selected() {
                    return this._selected;
                }
                set selected(value) {
                    this._selected = value;
                    if (value)
                        this.group.addValue(this);
                    else
                        this.group.removeValue(this);
                    this._doChange();
                }
                getDisplayValue() {
                    return this.caption;
                }
                get facet() {
                    return this.group.facet;
                }
                getParamValue() {
                    return this.domain;
                }
                get value() {
                    return this.domain;
                }
            }
            class SearchFilters extends Array {
                constructor(view, facet) {
                    super();
                    this.view = view;
                    this._selection = [];
                    if (!facet)
                        facet = new FacetView(this);
                    this._facet = facet;
                }
                static fromItem(view, el) {
                    let group = new SearchFilters(view);
                    group.push(SearchFilter.fromItem(view, el, group));
                    return group;
                }
                static fromGroup(view, el) {
                    let group = new SearchFilters(view);
                    for (let child of el.children())
                        group.push(SearchFilter.fromItem(view, $(child), group));
                    console.log(group);
                    return group;
                }
                addValue(item) {
                    this._selection.push(item);
                    this._facet.values = this._selection.map(item => (new SearchObject(item.toString(), item.value)));
                    this._refresh();
                }
                removeValue(item) {
                    this._selection.splice(this._selection.indexOf(item), 1);
                    this._facet.values = this._selection.map(item => ({ searchString: item.getDisplayValue(), value: item.value }));
                    this._refresh();
                }
                selectAll() {
                    for (let item of this)
                        this.addValue(item);
                    this.view.update();
                }
                get caption() {
                    return '<span class="fa fa-filter"></span>';
                }
                _refresh() {
                    console.log(this.view);
                    if (this._selection.length) {
                        if (this.view.facets.indexOf(this._facet) === -1)
                            this.view.facets.push(this._facet);
                    }
                    else if (this.view.facets.indexOf(this._facet) > -1)
                        this.view.facets.splice(this.view.facets.indexOf(this._facet), 1);
                }
                getParamValue(v) {
                    return v.value;
                }
                clear() {
                    this._selection = [];
                }
            }
            class SearchGroups extends SearchFilters {
                constructor(view, facet) {
                    if (!facet)
                        facet = new FacetGroup();
                    super(view, facet);
                }
                static fromGroup(opts) {
                    let view = opts.view;
                    let el = opts.el;
                    let facet = opts.facet || view.facetGrouping;
                    let group = new SearchGroups(view, facet);
                    if (el)
                        for (let child of el.children())
                            group.push(SearchGroup.fromItem(view, $(child), group));
                    return group;
                }
                addValue(item) {
                    this.view.groupLength++;
                    let newItem = new SearchObject(item.toString(), item.value);
                    newItem._ref = item;
                    this._facet.values.push(newItem);
                    this._refresh();
                }
                removeValue(item) {
                    this.view.groupLength--;
                    for (let i of this._facet.values)
                        if (i._ref === item) {
                            this._facet.values.splice(this._facet.values.indexOf(i), 1);
                            break;
                        }
                    this._refresh();
                }
                _refresh() {
                    if (this._facet.values.length) {
                        if (this.view.facets.indexOf(this._facet) === -1)
                            this.view.facets.push(this._facet);
                    }
                    else if (this.view.facets.indexOf(this._facet) > -1)
                        this.view.facets.splice(this.view.facets.indexOf(this._facet), 1);
                }
            }
            class SearchObject {
                constructor(display, value) {
                    this.display = display;
                    this.value = value;
                }
            }
            class SearchResult {
                constructor(field, value) {
                    this.field = field;
                    this.value = value;
                    this.text = value[1];
                    this.indent = true;
                }
                select() {
                    this.field.selectItem(this.value);
                }
            }
            class SearchField extends SearchItem {
                constructor(view, name, el, field) {
                    super(view, name, el);
                    this.field = field;
                    this._expanded = false;
                    if (field.type === 'ForeignKey') {
                        this.expandable = true;
                        this.children = [];
                    }
                    else {
                        this.expandable = false;
                    }
                }
                get expanded() {
                    return this._expanded;
                }
                set expanded(value) {
                    this._expanded = value;
                    if (value)
                        this._loadChildren();
                    else {
                        this.children = [];
                        if (this.view.$items)
                            for (let i = this.view.$items.length - 1; i > 0; i--) {
                                let obj = this.view.$items[i];
                                if (obj.field === this) {
                                    this.view.$items.splice(i, 1);
                                }
                            }
                    }
                }
                _loadChildren() {
                    this.loading = true;
                    this.view.scope.model.getFieldChoices(this.name, this.view.text)
                        .then((res) => {
                        this.children = res.items;
                        let index = this.view.$items.indexOf(this);
                        if (index > -1) {
                            for (let obj of this.children) {
                                index++;
                                this.view.$items.splice(index, 0, new SearchResult(this, obj));
                            }
                        }
                    })
                        .finally(() => this.view.scope.$apply(() => this.loading = false));
                }
                get facet() {
                    if (!this._facet)
                        this._facet = new FacetView(this);
                    return this._facet;
                }
                getDisplayValue() {
                    return this.value;
                }
                getParamValue(value) {
                    let r = {};
                    let name = this.name;
                    if (_.isArray(value)) {
                        r[name] = value[0];
                    }
                    else if (value instanceof SearchObject) {
                        return value.value;
                    }
                    else {
                        r[name + '__icontains'] = value;
                    }
                    return r;
                }
                get caption() {
                    return this.field.caption;
                }
                get value() {
                    if (this._value)
                        return this._value[1];
                    return this.view.text;
                }
                select() {
                    this.facet.addValue(this.value);
                    this.view.addFacet(this.facet);
                    this.view.close();
                    this.view.update();
                }
                selectItem(item) {
                    let domain = {};
                    domain[this.field.name] = item[0];
                    this.facet.addValue(new SearchObject(item[1], domain));
                    this.view.addFacet(this.facet);
                    this.view.close();
                    this.view.update();
                }
                static fromField(view, el) {
                    let field = view.view.fields[el.attr('name')];
                    return new SearchField(view, field.name, el, field);
                }
                get template() {
                    return _.sprintf(Katrid.i18n.gettext(`Search <i>%(caption)s</i> by: <strong>%(text)s</strong>`), {
                        caption: this.field.caption,
                        text: this.view.text,
                    });
                }
            }
            class SearchGroup extends SearchFilter {
                constructor(view, name, caption, group, el) {
                    super(view, name, el);
                    this.group = group;
                    this.caption = caption;
                    this._selected = false;
                }
                static fromItem(view, el, group) {
                    return new SearchGroup(view, el.attr('name'), el.attr('caption'), group, el);
                }
                toString() {
                    return this.caption;
                }
            }
            class CustomFilterItem extends SearchFilter {
                constructor(view, field, condition, value, group) {
                    super(view, field.name, field.caption, null, group);
                    this.field = field;
                    this.condition = condition;
                    this._value = value;
                    this._selected = true;
                }
                toString() {
                    let s = this.field.format(this._value);
                    return this.field.caption + ' ' + conditionsLabels[this.condition].toLowerCase() + ' "' + s + '"';
                }
                get value() {
                    let r = {};
                    r[this.field.name + conditionSuffix[this.condition]] = this.field.getParamValue(this._value);
                    return r;
                }
            }
            Katrid.UI.uiKatrid.controller('CustomFilterController', ['$scope', '$element', '$filter', function ($scope, $element, $filter) {
                    $scope.tempFilter = null;
                    $scope.customFilter = [];
                    $scope.fieldChange = function (field) {
                        $scope.field = field;
                        $scope.condition = field.defaultCondition;
                        $scope.conditionChange($scope.condition);
                    };
                    $scope.conditionChange = (condition) => {
                        $scope.controlVisible = $scope.field.isControlVisible(condition);
                    };
                    $scope.valueChange = (value) => {
                        console.log('value change', value);
                        $scope.searchValue = value;
                    };
                    $scope.addCondition = (field, condition, value) => {
                        if (!$scope.tempFilter)
                            $scope.tempFilter = new SearchFilters($scope.$parent.action.searchView);
                        $scope.tempFilter.push(new CustomFilterItem($scope.$parent.action.searchView, field, condition, value, $scope.tempFilter));
                        $scope.field = null;
                        $scope.condition = null;
                        $scope.controlVisible = false;
                        $scope.searchValue = undefined;
                    };
                    $scope.applyFilter = (field, condition, searchValue) => {
                        if ($scope.searchValue)
                            $scope.addCondition(field, condition, searchValue);
                        $scope.customFilter.push($scope.tempFilter);
                        $scope.tempFilter.selectAll();
                        $scope.tempFilter = null;
                        $scope.customSearchExpanded = false;
                    };
                }])
                .directive('customFilter', () => ({
                restrict: 'A',
                scope: {
                    action: '=',
                },
            }));
            class SearchView {
                constructor(scope, element, view) {
                    this.scope = scope;
                    this.element = element;
                    this.query = new SearchQuery(this);
                    this._viewMoreButtons = localStorage.getItem('katrid.search.viewMoreButtons') === 'true';
                    this.items = [];
                    this.fields = [];
                    this.filterGroups = [];
                    this.groups = [];
                    this._groupLength = this.groupLength = 0;
                    this.facets = [];
                    this.input = element.find('.search-view-input');
                    this.view = view;
                    this.$items = null;
                    this.facetGrouping = new FacetGroup();
                    if (view) {
                        this.el = $(view.content);
                        this.menu = element.find('.search-dropdown-menu.search-view-menu');
                        for (let child of this.el.children()) {
                            child = $(child);
                            let tag = child.prop('tagName');
                            let obj;
                            if (tag === 'FILTER') {
                                obj = SearchFilters.fromItem(this, child);
                                this.filterGroups.push(obj);
                            }
                            else if (tag === 'FILTER-GROUP') {
                                obj = SearchFilters.fromGroup(this, child);
                                this.filterGroups.push(obj);
                                continue;
                            }
                            else if (tag === 'GROUP') {
                                obj = SearchGroup.fromItem({ view: this, el: child });
                                this.groups.push(obj);
                                continue;
                            }
                            else if (tag === 'FIELD') {
                                obj = SearchField.fromField(this, child);
                                this.fields.push(obj);
                                continue;
                            }
                            console.log('obj', obj);
                            if (obj)
                                this.append(obj);
                        }
                        this.input
                            .on('input', (evt) => {
                            if (this.input.val().length) {
                                return this.show();
                            }
                            else {
                                return this.close();
                            }
                        })
                            .on('keydown', (evt) => {
                            switch (evt.which) {
                                case Katrid.UI.keyCode.DOWN:
                                    this.move(1);
                                    evt.preventDefault();
                                    break;
                                case Katrid.UI.keyCode.UP:
                                    this.move(-1);
                                    evt.preventDefault();
                                    break;
                                case Katrid.UI.keyCode.ENTER:
                                    this.scope.$apply(() => angular.element(this.menu.find('li.active a.search-menu-item')).scope().item.select(evt));
                                    break;
                                case Katrid.UI.keyCode.BACKSPACE:
                                    if (this.input.val() === '') {
                                        this.scope.$apply(() => this.facets.splice(this.facets.length - 1, 1).map(facet => facet.clear()));
                                        this.update();
                                    }
                                    break;
                            }
                        })
                            .on('blur', (evt) => {
                            this.input.val('');
                            return this.close();
                        });
                    }
                }
                addCustomGroup(field) {
                    if (!this.customGroups) {
                        this.customGroups = new SearchGroups(this, this.facetGrouping);
                        this.groups.push(this.customGroups);
                    }
                    let obj = new SearchGroup(this, field.name, field.caption, this.customGroups);
                    this.customGroups.push(obj);
                    obj.selected = true;
                }
                set viewMoreButtons(value) {
                    if (this._viewMoreButtons !== value) {
                        this._viewMoreButtons = value;
                        localStorage.setItem('katrid.search.viewMoreButtons', value.toString());
                    }
                }
                get viewMoreButtons() {
                    return this._viewMoreButtons;
                }
                load(filter) {
                    Object.entries(filter).map((item, idx) => {
                        let i = this.getByName(item[0]);
                        if (i)
                            i.selected = true;
                    });
                }
                getByName(name) {
                    for (let item of this.filterGroups)
                        for (let subitem of item)
                            if (subitem.name === name)
                                return subitem;
                    for (let item of this.items)
                        if (item.name === name)
                            return item;
                }
                append(item) {
                    this.items.push(item);
                }
                addFacet(facet) {
                    if (!this.facets.includes(facet))
                        this.facets.push(facet);
                }
                first() {
                    this.menu.find('li.active a.search-menu-item').removeClass('active');
                    this.menu.find('li:first').addClass('active');
                }
                remove(index) {
                    let facet = this.facets[index];
                    facet.destroy();
                    this.facets.splice(index, 1);
                    this.update();
                }
                getParams() {
                    let r = [];
                    for (let i of this.facets)
                        if (!i.grouping)
                            r = r.concat(i.getParamValues());
                    return r;
                }
                dump() {
                    let res = [];
                    for (let i of this.facets)
                        res.push(i);
                    return res;
                }
                move(distance) {
                    const fw = distance > 0;
                    distance = Math.abs(distance);
                    while (distance !== 0) {
                        distance--;
                        let el = this.element.find('.search-view-menu li.active');
                        if (el.length) {
                            el.removeClass('active');
                            if (fw) {
                                el = el.next();
                            }
                            else {
                                el = el.prev();
                            }
                            el.addClass('active');
                        }
                        else {
                            if (fw) {
                                el = this.element.find('.search-view-menu > li:first');
                            }
                            else {
                                el = this.element.find('.search-view-menu > li:last');
                            }
                            el.addClass('active');
                        }
                    }
                }
                update() {
                    if (this.groupLength !== this._groupLength) {
                        this._groupLength = this.groupLength;
                        this.scope.action.applyGroups(this.groupBy(), this.getParams());
                    }
                    else
                        this.scope.action.setSearchParams(this.getParams());
                }
                groupBy() {
                    return this.facetGrouping.values.map(obj => obj._ref.name);
                }
                show() {
                    let shouldApply = false;
                    if (!this.$items) {
                        this.$items = [].concat(this.fields);
                        shouldApply = true;
                    }
                    for (let obj of this.$items)
                        if (obj.expanded) {
                            obj.expanded = false;
                            shouldApply = true;
                        }
                    if (shouldApply)
                        this.scope.$apply();
                    this.menu.show();
                    this.first();
                }
                close() {
                    this.$items = null;
                    this.menu.hide();
                    this.reset();
                    this.input.val('');
                }
                reset() {
                    for (let i of this.fields)
                        if (i && i.children && i.children.length)
                            i.expanded = false;
                }
            }
            class SearchViewComponent {
                constructor() {
                    this.restrict = 'E';
                    this.templateUrl = 'view.search.jinja2';
                    this.replace = true;
                    this.scope = false;
                }
            }
            class SearchViewArea {
                constructor() {
                    this.restrict = 'A';
                    this.scope = false;
                }
                link(scope, el, attrs) {
                    let view = scope.action.views.search;
                    scope.action.searchView = new SearchView(scope, el, view);
                    if (scope.action.context.default_search) {
                        scope.action.searchView.load(scope.action.context.default_search);
                    }
                }
            }
            Katrid.UI.uiKatrid.controller('SearchMenuController', ['$scope', function ($scope) {
                }]);
            Katrid.UI.uiKatrid.directive('searchView', SearchViewComponent);
            Katrid.UI.uiKatrid.directive('searchViewArea', SearchViewArea);
        })(Views = Forms.Views || (Forms.Views = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Views;
        (function (Views) {
            class ViewInfo {
                constructor(info) {
                    this._info = info;
                    this.fields = info.fields;
                    this.content = info.content;
                    this.toolbar = info.toolbar;
                }
            }
            Views.ViewInfo = ViewInfo;
        })(Views = Forms.Views || (Forms.Views = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Widgets;
        (function (Widgets) {
            let WIDGET_COUNT = 0;
            let DEFAULT_COLS = {
                'BooleanField': 3,
                'DecimalField': 3,
                'FloatField': 3,
                'DateField': 3,
                'DateTimeField': 3,
                'IntegerField': 3,
                'SmallIntegerField': 3,
                'TimeField': 3,
                'CharField': 3,
                'OneToManyField': 12
            };
            class Field {
                constructor(scope, attrs, field, element) {
                    this.attrs = attrs;
                    this.scope = scope;
                    this.templAttrs = {};
                    this.wAttrs = {};
                    this.field = field;
                    this.element = element;
                    this.content = element.html();
                    this.spanPrefix = '';
                    if ((field.depends != null) && field.depends.length)
                        scope.dataSource.addFieldWatcher(field);
                    if (attrs.ngShow)
                        this.templAttrs['ng-show'] = attrs.ngShow;
                    if (attrs.ngReadonly || field.readonly)
                        this.templAttrs['ng-readonly'] = attrs.ngReadonly || field.readonly;
                    if (field.attrs)
                        for (let k of field.attrs) {
                            let v = field.attrs[k];
                            if (k.startsWith('container') || ((k === 'ng-show') && !attrs.ngShow)) {
                                this.templAttrs[k] = v;
                            }
                        }
                    if (attrs.ngFieldChange) {
                        this.wAttrs['ng-change'] = attrs.ngFieldChange;
                    }
                    let cols = attrs.cols;
                    if (!cols) {
                        if (field.type === 'CharField')
                            if (field.max_length && (field.max_length < 30))
                                cols = 3;
                        if (!cols)
                            cols = DEFAULT_COLS[field.type] || 6;
                    }
                    this.col = cols;
                    this.classes = ['form-field'];
                    if (field.onchange)
                        scope.$watch();
                }
                static get tag() {
                    return 'input';
                }
                fieldChangeEvent() {
                }
                get caption() {
                    return this.element.attr('label') || this.field.caption;
                }
                renderTo(templTag, inplaceEditor = false, cls = '') {
                    let templAttrs = [];
                    for (let [k, v] of Object.entries(this.templAttrs))
                        templAttrs.push(k + '=' + '"' + v + '"');
                    if (inplaceEditor)
                        return `<${templTag} class="${cls}" ${templAttrs.join('')}>${this.template(this.scope, this.element, this.attrs, this.field)}</${templTag}>`;
                    return `<${templTag} class="${this.field.type} section-field-${this.field.name} form-group" ${templAttrs.join('')}>` +
                        this.template(this.scope, this.element, this.attrs, this.field) +
                        `</${templTag}>`;
                }
                get ngModel() {
                    return `record.${this.field.name}`;
                }
                get id() {
                    if (!this._id)
                        this._id = ++WIDGET_COUNT;
                    return `katrid-input-${this._id.toString()}`;
                }
                widgetAttrs(...args) {
                    let v;
                    const r = this.wAttrs;
                    if (this.field.required) {
                        r['required'] = null;
                    }
                    r['ng-model'] = this.ngModel;
                    if (this.field.attrs) {
                        for (let attr of Object.keys(this.field.attrs)) {
                            v = this.field.attrs[attr];
                            if (!attr.startsWith('container-') && (attr !== 'ng-show') && (attr !== 'ng-readonly')) {
                                r[attr] = v;
                            }
                        }
                    }
                    if (!_.isUndefined(this.attrs.$attr))
                        for (let attr of Object.keys(this.attrs.$attr)) {
                            let attrName = this.attrs.$attr[attr];
                            if (!attrName.startsWith('container-') && (attr !== 'ngShow') && (attr !== 'ngReadonly')) {
                                v = this.attrs[attr];
                                if (attrName.startsWith('field-')) {
                                    attrName = attrName.substr(6, attrName.length - 6);
                                }
                                else if (attrName === 'class')
                                    this.classes.push(v);
                                r[attrName] = v;
                            }
                        }
                    if ((this.attrs.readonly != null) || this.field.readonly)
                        r['readonly'] = '';
                    if (this.classes)
                        r['class'] = this.classes.join(' ');
                    return r;
                }
                _getWidgetAttrs(scope, el, attrs, field) {
                    let html = '';
                    let attributes = this.widgetAttrs(scope, el, attrs, field);
                    for (let att in attributes) {
                        const v = attributes[att];
                        html += ` ${att}`;
                        if (v || (v === false)) {
                            if (_.isString(v) && (v.indexOf('"') > -1)) {
                                html += `='${v}'`;
                            }
                            else {
                                html += `="${v}"`;
                            }
                        }
                    }
                    if (this.placeholder)
                        html += ` placeholder="${this.placeholder}" `;
                    return html;
                }
                innerHtml() {
                    return '';
                }
                labelTemplate() {
                    const placeholder = '';
                    const label = this.caption;
                    if (this.attrs.nolabel === 'placeholder') {
                        this.placeholder = label;
                        return '';
                    }
                    else if (!_.isUndefined(this.attrs.nolabel))
                        return '';
                    return `<label for="${this.id}" class="form-label">${label}</label>`;
                }
                get emptyText() {
                    if (this.inplaceEditor)
                        return '';
                    return '--';
                }
                get readOnlyClass() {
                    if (this.inplaceEditor || this.spanPrefix === '::')
                        return 'grid-field-readonly';
                    return 'form-field-readonly';
                }
                spanTemplate(scope, el, attrs, field) {
                    return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}record.${this.field.name}.toString() || '${this.emptyText}' }}</span>`;
                }
                widgetTemplate() {
                    let html = `<${this.constructor.tag} id="${this.id}" name="${this.field.name}" ${this._getWidgetAttrs()}>`;
                    const inner = this.innerHtml();
                    if (inner)
                        html += inner + `</${this.constructor.tag}>`;
                    return html;
                }
                template(...args) {
                    let label = '';
                    let span = this.spanTemplate();
                    if (!this.inplaceEditor) {
                        label = this.labelTemplate();
                    }
                    let widget = this.widgetTemplate();
                    if (this.inline === 'inline')
                        widget = `<div ng-if="dataSource.changing && dataSource.recordIndex === $index">${widget}</div>`;
                    return `<div>${label}${span}${widget}</div>`;
                }
                link(scope, el, attrs, $compile, field) {
                    if (field.depends) {
                        return (() => {
                            const result = [];
                            for (let dep of Array.from(field.depends)) {
                                if (!Array.from(scope.dataSource.fieldChangeWatchers).includes(dep)) {
                                    scope.dataSource.fieldChangeWatchers.push(dep);
                                    result.push(scope.$watch(`record.${dep}`, function (newValue, oldValue) {
                                        if ((newValue !== oldValue) && scope.dataSource.changing) {
                                            return scope.model.onFieldChange(dep, scope.record)
                                                .done(scope.dataSource.onFieldChange);
                                        }
                                    }));
                                }
                            }
                            return result;
                        })();
                    }
                }
                th() {
                    let cls = `${this.field.type} list-column`;
                    let lbl = this.element.attr('label') || `{{view.fields.${this.field.name}.caption}}`;
                    return `<th class="${cls}" name="${this.field.name}"><span>${lbl}</span></th>`;
                }
                _gridEditor(cls) {
                    return this.renderTo('section', true, cls);
                }
                _tdContent() {
                    return this.spanTemplate();
                }
                _td(cls) {
                    let content;
                    if (this.inplaceEditor)
                        content = this._gridEditor(cls);
                    else {
                        this.spanPrefix = '::';
                        content = this.spanTemplate();
                    }
                    return `<td class="${cls}">${content}</td>`;
                }
            }
            Widgets.Field = Field;
            class InputWidget extends Field {
                static get tag() {
                    return 'input input-field';
                }
                constructor(scope, attrs, field, element) {
                    super(scope, attrs, field, element);
                    this.classes.push('form-control');
                }
                get type() {
                    return 'text';
                }
                widgetTemplate() {
                    let type = this.type;
                    const prependIcon = this.attrs.icon;
                    let html = `<${this.constructor.tag} id="${this.id}" type="${this.type}" name="${this.field.name}" ${this._getWidgetAttrs()}>`;
                    if (prependIcon)
                        return `<label class="prepend-icon"><i class="icon ${prependIcon}"></i>${html}</label>`;
                    const inner = this.innerHtml();
                    if (inner)
                        html += inner + `</${this.constructor.tag}>`;
                    return html;
                }
            }
            class StringField extends InputWidget {
                widgetAttrs() {
                    const attributes = super.widgetAttrs();
                    if (this.field.maxLength)
                        attributes['maxlength'] = this.field.maxLength.toString();
                    return attributes;
                }
            }
            Widgets.StringField = StringField;
            class NumericField extends InputWidget {
                static get tag() {
                    return 'input decimal';
                }
                get type() {
                    if (Katrid.settings.ui.isMobile)
                        return 'number';
                    return 'text';
                }
                spanTemplate() {
                    return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|number) || '${this.emptyText}' }}</span>`;
                }
            }
            Widgets.NumericField = NumericField;
            class IntegerField extends NumericField {
                static get tag() {
                    return 'input decimal decimal-places="0"';
                }
            }
            Widgets.IntegerField = IntegerField;
            class TimeField extends InputWidget {
                get type() {
                    return 'time';
                }
            }
            Widgets.TimeField = TimeField;
            class SelectionField extends InputWidget {
                static get tag() {
                    return 'select';
                }
                spanTemplate() {
                    return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}view.fields.${this.field.name}.displayChoices[record.${this.field.name}] || '${this.emptyText}' }}</span>`;
                }
                innerHtml() {
                    return `<option ng-repeat="choice in view.fields.${this.field.name}.choices" value="{{choice[0]}}">{{choice[1]}}</option>`;
                }
            }
            Widgets.SelectionField = SelectionField;
            class ForeignKey extends Field {
                static get tag() {
                    return 'input fk-autocomplete';
                }
                spanTemplate() {
                    let allowOpen = true;
                    if (((this.attrs.allowOpen != null) && (this.attrs.allowOpen === 'false')) || ((this.attrs.allowOpen == null) && this.field.attrs && (this.field.attrs['allow-open'] === false)))
                        allowOpen = false;
                    if (!allowOpen || this.inList)
                        return `<span class="${this.readOnlyClass}"><a href="javascript:void(0)">{{ ${this.spanPrefix}record.${this.field.name}[1] || '${this.emptyText}' }}</a></span>`;
                    return `<span class="${this.readOnlyClass}"><a href="#/action/${this.field.model}/view/?id={{ ${this.spanPrefix}record.${this.field.name}[0] }}" ng-click="action.openObject('${this.field.model}', record.${this.field.name}[0], $event, '${this.field.caption}')">{{ ${this.spanPrefix}record.${this.field.name}[1] }}</a><span ng-if="!record.${this.field.name}[1]">--</span></span>`;
                }
                get type() {
                    return 'text';
                    return 'hidden';
                }
                _tdContent() {
                    return `{{record.${this.field.name}[1]}}`;
                }
            }
            Widgets.ForeignKey = ForeignKey;
            class TextField extends StringField {
                static get tag() {
                    return 'textarea';
                }
            }
            Widgets.TextField = TextField;
            class XmlField extends TextField {
            }
            Widgets.XmlField = XmlField;
            class FloatField extends NumericField {
                static get tag() {
                    if (Katrid.settings.ui.isMobile)
                        return 'input';
                    return 'input decimal';
                }
                get type() {
                    if (Katrid.settings.ui.isMobile)
                        return 'number';
                    return 'text';
                }
                spanTemplate() {
                    let decimalPlaces = this.attrs.decimalPlaces || 2;
                    return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|number:${decimalPlaces}) || '${this.emptyText}' }}</span>`;
                }
                _tdContent() {
                    let filter;
                    let decimalPlaces = this.element.attr('decimal-places');
                    if (decimalPlaces)
                        filter `number:${decimalPlaces}`;
                    else
                        filter = `numberFormat:${this.element.attr('max-digits') || 6}`;
                    return `{{::record.${this.field.name}|${filter} }}`;
                }
            }
            Widgets.FloatField = FloatField;
            class DecimalField extends FloatField {
                spanTemplate() {
                    let maxDigits = this.attrs.maxDigits;
                    let fmt = 'number';
                    if (maxDigits)
                        fmt = 'numberFormat';
                    else
                        maxDigits = this.attrs.decimalPlaces || 2;
                    return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|${fmt}:${maxDigits}) || '${this.emptyText}' }}</span>`;
                }
            }
            Widgets.DecimalField = DecimalField;
            class DateField extends TextField {
                static get tag() {
                    return 'input date-input';
                }
                get type() {
                    return 'date';
                }
                spanTemplate() {
                    return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|date:'${Katrid.i18n.gettext('yyyy-mm-dd').replace(/[m]/g, 'M')}') || '${this.emptyText}' }}</span>`;
                }
            }
            Widgets.DateField = DateField;
            class DateTimeField extends TextField {
                static get tag() {
                    return 'input date-input';
                }
                get type() {
                    return 'datetime-local';
                }
                spanTemplate() {
                    return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|date:'${Katrid.i18n.gettext('yyyy-MM-dd hh:mma')}') || '${this.emptyText}' }}</span>`;
                }
            }
            class OneToManyField extends Field {
                static get tag() {
                    return 'grid';
                }
                spanTemplate() {
                    return '';
                }
                innerHtml() {
                    return this.content;
                    let html = this.element.html();
                    if (html)
                        return html;
                    return '';
                }
            }
            Widgets.OneToManyField = OneToManyField;
            class ManyToManyField extends Field {
                static get tag() {
                    return 'input foreignkey multiple';
                }
                spanTemplate() {
                    return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}record.${this.field.name}|m2m }}</span>`;
                }
                get type() {
                    return 'hidden';
                }
            }
            Widgets.ManyToManyField = ManyToManyField;
            class BooleanField extends InputWidget {
                spanTemplate() {
                    return `<span class="${this.readOnlyClass} bool-text">
  {{${this.spanPrefix}record.${this.field.name} ? '${Katrid.i18n.gettext('yes')}' : '${Katrid.i18n.gettext('no')}'}}
  </span>`;
                }
                get type() {
                    return 'checkbox';
                }
                widgetTemplate() {
                    let html = super.widgetTemplate();
                    html = `<label class="checkbox" ng-show="dataSource.changing">${html}`;
                    if (this.field.help_text) {
                        html += this.field.help_text;
                    }
                    else {
                        html += this.field.caption;
                    }
                    html += '<i></i></label>';
                    return html;
                }
                labelTemplate() {
                    if (this.field.help_text)
                        return super.labelTemplate();
                    return `<label for="${this.id}" class="form-label form-label-checkbox"><span>${this.caption}</span>&nbsp;</label>`;
                }
            }
            class FileField extends InputWidget {
                static get tag() {
                    return 'input file-reader';
                }
                get type() {
                    return 'file';
                }
            }
            Widgets.FileField = FileField;
            class ImageField extends FileField {
                static get tag() {
                    return 'input file-reader accept="image/*"';
                }
                spanTemplate() {
                    return '';
                }
                widgetTemplate() {
                    let html = super.widgetTemplate();
                    let imgSrc = this.attrs.ngEmptyImage || (this.attrs.emptyImage && ("'" + this.attrs.emptyImage + "'")) || "'/static/web/assets/img/no-image.png'";
                    html = `<div class="image-box image-field">
  <img ng-src="{{ record.${this.field.name} || ${imgSrc} }}" />
    <div class="text-right image-box-buttons">
    <button class="btn btn-default" type="button" title="${Katrid.i18n.gettext('Change')}" onclick="$(this).closest('.image-box').find('input').trigger('click')"><i class="fa fa-pencil"></i></button>
    <button class="btn btn-default" type="button" title="${Katrid.i18n.gettext('Clear')}" ng-click="record[this.field.name] = null"><i class="fa fa-trash"></i></button>
    </div>
      ${html}</div>`;
                    return html;
                }
            }
            Widgets.ImageField = ImageField;
            class PasswordField extends InputWidget {
                get type() {
                    return 'password';
                }
                spanTemplate() {
                    return `<span class="form-field-readonly">*******************</span>`;
                }
            }
            class SortableField extends Field {
                constructor(scope, attrs, field, element) {
                    super(scope, attrs, field, element);
                    this.col = null;
                }
                static get tag() {
                    return 'sortable-field';
                }
                get type() {
                    return 'hidden';
                }
                th() {
                    return `<th class="list-column-sortable" name="${this.field.name}"></th>`;
                }
                spanTemplate() {
                    return `<sortable-field id="${this.id}" name="${this.field.name}" ng-model="record.${this.field.name}"/>`;
                }
            }
            Widgets.SortableField = SortableField;
            Object.assign(Katrid.Forms.Widgets.registry, {
                Field,
                InputWidget,
                StringField,
                IntegerField,
                SelectionField,
                ForeignKey,
                TextField,
                DecimalField,
                FloatField,
                DateField,
                DateTimeField,
                TimeField,
                BooleanField,
                OneToManyField,
                ManyToManyField,
                FileField,
                PasswordField,
                ImageField,
                SortableField,
                XmlField,
                input: InputWidget,
                string: StringField,
                integer: IntegerField,
                selection: SelectionField,
                text: TextField,
                decimal: DecimalField,
                float: FloatField,
                file: FileField,
                boolean: BooleanField,
                password: PasswordField,
                image: ImageField,
                sortable: SortableField,
            });
        })(Widgets = Forms.Widgets || (Forms.Widgets = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Widgets;
        (function (Widgets) {
            class OneToManyWidget extends Widgets.FieldWidget {
                create() {
                    super.create();
                    this._viewMode = this._fieldEl.getAttribute('view-mode') || 'list';
                    this._model = new Katrid.Services.Model(this.field.info.model);
                    this._scope = this.actionView.action.scope.$new(true);
                    this._scope.model = this._model;
                    this._action = new OneToManyAction(this);
                    let views = {};
                    let template = this._fieldEl.querySelector('template');
                    if (template)
                        for (let child of template.content.children)
                            views[child.tagName.toLowerCase()] = child.cloneNode(true);
                    this._dataSource = new Katrid.Data.DataSource({
                        model: this._model,
                        scope: this._scope,
                        master: this.actionView.action.dataSource,
                        field: this.field,
                        action: this._action,
                        pageLimit: this.field.info.page_limit,
                    });
                    this.loadViews(views);
                }
                get dataSource() {
                    return this._dataSource;
                }
                get scope() {
                    return this._scope;
                }
                get model() {
                    return this._model;
                }
                async loadViews(preLoadedViews) {
                    let viewModes = { form: null };
                    viewModes[this._viewMode] = null;
                    let res = await this.model.loadViews({ views: viewModes });
                    this.views = res.views;
                    let viewInfo = this._viewInfo = res.views[this._viewMode];
                    let relField = viewInfo.fields[this.field.info.field];
                    if (relField)
                        relField.visible = false;
                    for (let k of Object.keys(preLoadedViews)) {
                        if (!(k in res.views))
                            res.views[k] = { fields: res.fields };
                        res.views[k].content = preLoadedViews[k];
                        res.views[k].fields = res.fields;
                    }
                    this._scope.action = this._action;
                    this.view = new Katrid.Forms.Views.registry[this._viewMode]({
                        action: this._action,
                        viewInfo,
                    });
                    this._scope.views = res.views;
                    this._scope.view = this.view;
                    this.render(this.view.render(this)[0]);
                    this.querySelector('.content');
                }
                render(elView) {
                    let tb = this.renderToolbar();
                    Katrid.Core.$compile(tb)(this._scope);
                    this.appendChild(tb);
                    this.appendChild(elView);
                }
                renderToolbar() {
                    let tb = document.createElement('div');
                    tb.classList.add('grid-toolbar', 'col-12');
                    let btn = document.createElement('button');
                    btn.setAttribute('type', 'button');
                    btn.classList.add('btn', 'btn-xs', 'btn-outline-secondary', 'grid-editor-control');
                    btn.innerText = Katrid.i18n.gettext('Add');
                    btn.setAttribute('ng-show', '$parent.action.dataSource.changing');
                    tb.appendChild(btn);
                    btn.addEventListener('click', () => this._action.addItem());
                    let btnDelete = document.createElement('button');
                    btnDelete.setAttribute('type', 'button');
                    btnDelete.classList.add('btn', 'btn-xs', 'btn-outline-secondary', 'grid-editor-control');
                    btnDelete.innerText = Katrid.i18n.gettext('Delete selection');
                    btnDelete.addEventListener('click', () => this._action.deleteSelection());
                    btnDelete.setAttribute('ng-show', 'action.selection.length && $parent.action.dataSource.changing');
                    tb.appendChild(btnDelete);
                    return tb;
                }
                get viewMode() {
                    return this._viewMode;
                }
                async showDialog() {
                    let formInfo = this.views.form;
                    let relField = formInfo.fields[this.field.info.field];
                    if (relField)
                        relField.visible = false;
                    let view = new Katrid.Forms.Views.FormDialog({
                        action: this._action,
                        viewInfo: formInfo,
                        templateUrl: 'view.form.empty.jinja2',
                    });
                    let el = view.prepare();
                    this._action.view = view;
                    this._scope.view = view;
                    let dlg = $(Katrid.app.getTemplate('view.form.dialog.jinja2', { caption: view.caption || this.field.caption }));
                    this.dlg = dlg;
                    dlg[0].action = this._action;
                    dlg.find('.modal-body').append(el);
                    dlg.modal({ backdrop: 'static' });
                    dlg.on('hidden', () => dlg.data('modal', null));
                    Katrid.Core.$compile(dlg)(this._scope);
                    this._action.form = angular.element(this._action.$form).controller('form');
                }
                destroy() {
                    super.destroy();
                    this._dataSource.destroy();
                }
            }
            Widgets.OneToManyWidget = OneToManyWidget;
            Katrid.define('onetomany-field', OneToManyWidget);
            class RadioField extends Widgets.FieldWidget {
                create() {
                    super.create();
                    let label = document.createElement('div');
                    label.setAttribute('ng-repeat', `choice in view.viewInfo.fields.${this.field.name}.choices`);
                    label.classList.add('radio-button', 'radio-inline');
                    let css = this._fieldEl.getAttribute('class');
                    if (css)
                        label.classList.add(css.split(' '));
                    let input = document.createElement('input');
                    let id = `id-${this.field.name}-${this._id}-\${$index}`;
                    input.setAttribute('id', id);
                    input.setAttribute('type', 'radio');
                    input.setAttribute('ng-model', `$parent.record.${this.field.name}`);
                    input.setAttribute('ng-value', `choice[0]`);
                    let txt = document.createElement('label');
                    txt.setAttribute('ng-bind', 'choice[1]');
                    txt.setAttribute('for', id);
                    label.appendChild(input);
                    label.appendChild(txt);
                    this.appendChild(label);
                }
            }
            class OneToManyAction {
                constructor(field) {
                    this.field = field;
                    this.scope = field.scope;
                    this.selection = [];
                }
                get dataSource() {
                    return this.field.dataSource;
                }
                listRowClick(index, record, event) {
                    this.editItem(record);
                }
                async addItem() {
                    this.field.showDialog();
                    await this.field.dataSource.insert();
                    this.field.dataSource.record[this.field.field.info.field] = this.field.actionView.action.dataSource.recordId;
                }
                deleteSelection() {
                    let i = 0;
                    let recs = [];
                    for (let checkbox of this.field.querySelectorAll(".list-record-selector input[type='checkbox']")) {
                        if (checkbox.checked) {
                            checkbox.closest('tr').remove();
                            recs.push(angular.element(checkbox).scope().record.$record);
                        }
                        i++;
                    }
                    for (let rec of recs)
                        rec.delete();
                    this.selection = [];
                }
                selectToggle(item) {
                    this.selection = [];
                    for (let checkbox of item.closest('table').querySelectorAll("input[type='checkbox']"))
                        if (checkbox.checked)
                            this.selection.push(checkbox.getAttribute('data-id'));
                    console.log('selection', this.selection);
                }
                editItem(record) {
                    console.log('item click');
                    this.field.scope.record = record;
                    if (this.field.actionView.action.dataSource.changing)
                        this.field.dataSource.edit();
                    this.field.showDialog();
                }
                setDirty() {
                    console.log('set dirty');
                }
                saveAndClose() {
                    this.field.dlg.modal('hide');
                    this.field.dataSource.flush();
                    if (!this.scope.records)
                        this.scope.records = [];
                    this.scope.records.push(this.scope.record);
                }
            }
            Katrid.define('radio-field', RadioField);
        })(Widgets = Forms.Widgets || (Forms.Widgets = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Grid;
    (function (Grid) {
        class TableColumn {
            constructor(collection, config) {
                this.width = 100;
                this._collection = collection;
                this._table = collection.table;
                let cfg = { width: this.width };
                if (config)
                    Object.assign(cfg, { text: config.caption || config.name });
                let h = collection.header[0].add(this, cfg);
                h.resizable = true;
            }
            get collection() {
                return this._collection;
            }
            get table() {
                return this._table;
            }
            get index() {
                return this._collection.indexOf(this);
            }
            startSelection() {
                let x = this.index;
                let cell = this._table.getCell(x, 0);
                this._table.startSelection(cell);
                cell.focus();
                this._table.endSelection(this._table.getCell(x, -1));
            }
        }
        Grid.TableColumn = TableColumn;
        class TableColumns extends Array {
            constructor(table, config) {
                super();
                this._table = table;
                this.header = new TableRowHeader(this);
                let h = this.header.add();
                for (let col of config.columns)
                    this.push(new TableColumn(this, col));
            }
            get table() {
                return this._table;
            }
            add(config) {
                let col = new TableColumn(this, config);
                this.push(col);
                return col;
            }
        }
        Grid.TableColumns = TableColumns;
        class TableRow extends Array {
            constructor(collection, data) {
                super();
                this.setCollection(collection);
                let items = [];
                if (_.isArray(data)) {
                    for (let v of data)
                        this.push(new TableCell(this, null, { value: v }));
                }
                this.header = new TableHeader(this);
            }
            render(tbody) {
                let tr = document.createElement('tr');
                this.header = new TableHeader(this);
                if (this._collection.showLineNumbers)
                    this.header.push(new TableHeaderCell(this, { text: this.index + 1 }));
                else if (this.key)
                    this.header.push(new TableHeaderCell(this, { text: this.key }));
                for (let header of this.header)
                    header.render(tr);
                for (let cell of this)
                    cell.render(tr);
                tbody.appendChild(tr);
                return tr;
            }
            get collection() {
                return this._collection;
            }
            setCollection(value) {
                this._collection = value;
                this.table = value.table;
            }
            get index() {
                return this._collection.indexOf(this);
            }
        }
        class TableCell {
            constructor(row, col, config) {
                this.tag = 'td';
                this.allowFocus = true;
                this.row = row;
                if (row)
                    this._table = row.table;
                else if (col)
                    this._table = col.table;
                this.value = config.value;
                this.text = config.text;
            }
            render(tr) {
                if (!this.childMerged) {
                    let el = document.createElement(this.tag);
                    this.el = el;
                    if (this.allowFocus) {
                        this.el.tabIndex = 9999;
                        this.el.onpointerdown = (evt) => {
                            this.focus();
                            evt.stopPropagation();
                            evt.preventDefault();
                            this._table.isSelecting = true;
                            this._table.startSelection(this);
                        };
                        this.el.onpointerup = (evt) => {
                            evt.stopPropagation();
                            this._table.isSelecting = false;
                        };
                        this.el.onpointerenter = () => {
                            if (this._table.isSelecting) {
                                this.focus();
                                this._table.endSelection(this);
                            }
                        };
                        this.el.ondblclick = () => {
                            this.startEdit();
                        };
                    }
                    if (this.value)
                        this.text = this.value.toString();
                    el.innerHTML = this.text;
                    if (this.merged) {
                        if (this.colsMerged)
                            el.setAttribute('colspan', this.colsMerged.length.toString());
                        if (this.rowsMerged)
                            el.setAttribute('rowspan', this.rowsMerged.length.toString());
                    }
                    tr.appendChild(el);
                    return el;
                }
            }
            focus() {
                this.el.focus();
            }
            createInplaceEditor() {
                let ed = document.createElement('input');
                ed.classList.add('inplace-editor');
                this.el.appendChild(ed);
                ed.style.width = this.el.clientWidth + 'px';
                ed.onkeydown = (evt) => {
                    evt.stopPropagation();
                    if (evt.code === 'Enter' || evt.code === 'Tab') {
                        this.stopEdit(true);
                        this.next();
                        evt.preventDefault();
                    }
                    else if (evt.code === 'Escape') {
                        evt.preventDefault();
                        this.stopEdit(false);
                    }
                };
                ed.value = this.text;
                ed.focus();
                this.editor = ed;
            }
            destroyInplaceEditor(commit) {
                if (commit)
                    this.setText(this.editor.value);
                this.editor.remove();
                this.editor = null;
            }
            setText(v) {
                this.text = v;
                this.el.innerText = v;
            }
            startEdit() {
                this._editing = true;
                this.createInplaceEditor();
            }
            stopEdit(commit) {
                this.destroyInplaceEditor(commit);
                this._editing = false;
                this.focus();
            }
            next() {
                this._table.moveBy(1, 0);
            }
            get x() {
                return this.row.indexOf(this);
            }
            get y() {
                return this.row.index;
            }
            get selected() {
                return this._selected;
            }
            get editing() {
                return this._editing;
            }
            set selected(value) {
                this._selected = value;
                if (value)
                    this.el.classList.add('selected');
                else
                    this.el.classList.remove('selected');
            }
        }
        Grid.TableCell = TableCell;
        class ColSizer {
            constructor(th) {
                this._th = th;
                this.createElement();
            }
            createElement() {
                this._el = document.createElement('div');
                this._el.classList.add('col-sizer');
                this._th.appendChild(this._el);
                this._el.onpointerdown = (evt) => {
                    evt.stopPropagation();
                    evt.preventDefault();
                    let x = evt.clientX;
                    let w = this._th.clientWidth;
                    let l = this._el.clientLeft;
                    this._el.onpointermove = (evt) => {
                        let diff = evt.clientX - x;
                        this._th.style.maxWidth = w + diff + 'px';
                        this._th.style.width = this._th.style.maxWidth;
                        this._el.style.transform = `transform(${diff})px`;
                    };
                    this._el.setPointerCapture(evt.pointerId);
                };
                this._el.onpointerup = (evt) => {
                    this._el.onpointermove = null;
                    this._el.releasePointerCapture(evt.pointerId);
                };
            }
            destroyElement() {
                this._el.remove();
                delete this._el;
            }
        }
        class TableHeaderCell extends TableCell {
            constructor(axis, config) {
                super(axis, null, config);
                this.tag = 'th';
                this.allowFocus = false;
                this.axis = axis;
                this._table = axis.table;
                this.width = config.width;
            }
            render(tr) {
                let el = super.render(tr);
                el.style.width = this.width + 'px';
                if (el) {
                    if (this.resizable)
                        this.sizer = new ColSizer(el);
                    el.onpointerdown = (evt) => {
                        evt.stopPropagation();
                        evt.preventDefault();
                        this.axis.startSelection();
                    };
                    return el;
                }
            }
        }
        Grid.TableHeaderCell = TableHeaderCell;
        class TableRows extends Array {
            constructor(table) {
                super();
                this.showLineNumbers = true;
                this.table = table;
            }
            render(tbody) {
                for (let row of this)
                    row.render(tbody);
                let tr = document.createElement('tr');
                tr.classList.add('report-band');
                let td = document.createElement('td');
                tr.appendChild(td);
                td.setAttribute('colspan', (this.table.columns.length + 1).toString());
                td.innerText = 'DATA(QUERY1): SELECT * FROM TABLE1';
                tbody.insertBefore(tr, tbody.querySelector('tr:last-child'));
                let tr2 = document.createElement('tr');
                tr2.classList.add('col-header-band');
                td = document.createElement('td');
                tr2.appendChild(td);
                td.setAttribute('colspan', (this.table.columns.length + 1).toString());
                td.innerText = 'COL HEADER';
                tbody.insertBefore(tr2, tr.previousSibling);
                tr = document.createElement('tr');
                tr.classList.add('report-band');
                td = document.createElement('td');
                tr.appendChild(td);
                td.setAttribute('colspan', (this.table.columns.length + 1).toString());
                td.innerText = 'END DATA';
                tbody.appendChild(tr);
            }
            loadData(data) {
                for (let obj of data)
                    this.addRow(obj);
            }
            addRow(data, caption) {
                let row = new TableRow(this, data);
                this.push(row);
                if (!this.table.isLoading)
                    row.render(this.tbody);
                return row;
            }
        }
        Grid.TableRows = TableRows;
        class TableHeader extends Array {
            constructor(axis) {
                super();
                this.collection = axis;
                this._table = axis.table;
            }
            render(thead) {
                let tr = document.createElement('tr');
                for (let col of this)
                    col.render(tr);
                thead.appendChild(tr);
                return tr;
            }
            get table() {
                return this._table;
            }
            add(column, config) {
                let h = new TableHeaderCell(column, config);
                this.push(h);
                return h;
            }
        }
        Grid.TableHeader = TableHeader;
        class TableRowHeader extends Array {
            constructor(collection, ...items) {
                super(...items);
                this._collection = collection;
                this._table = collection.table;
            }
            render(table) {
                if (this.length) {
                    let thead = document.createElement('thead');
                    let c = 0;
                    for (let row of this) {
                        let tr = row.render(thead);
                        if (!c) {
                            let th = document.createElement('th');
                            tr.insertBefore(th, tr.firstChild);
                        }
                        c++;
                    }
                    table.appendChild(thead);
                    return thead;
                }
            }
            add(config) {
                let h = new TableHeader(this);
                this.push(h);
                return h;
            }
            get collection() {
                return this._collection;
            }
            get table() {
                return this._table;
            }
        }
        Grid.TableRowHeader = TableRowHeader;
        class CustomTable {
            constructor(config) {
                this._isLoading = true;
                this._columns = new TableColumns(this, config);
                this._rows = new TableRows(this);
                this._rows.table = this;
                if (config.data)
                    this._rows.loadData(config.data);
                this._config = config;
                let el = config.el;
                let dom = config.dom;
                if (el)
                    dom = document.querySelector(el);
                this._el = dom;
                this._isLoading = false;
                this.render();
            }
            insertRow(index) {
            }
            moveBy(x, y) {
                let cx = this.cellEnd.x + x;
                let cy = this.cellEnd.y + y;
                if (cy > -1 && cy < this._rows.length) {
                    let row = this._rows[cy];
                    if (cx > -1 && cx < row.length) {
                        let cell = row[cx];
                        this.startSelection(cell);
                        cell.focus();
                    }
                }
            }
            getCell(x, y) {
                if (y === -1)
                    y = this._rows.length - 1;
                if (x === -1)
                    x = this._columns.length - 1;
                return this._rows[y][x];
            }
            render() {
                let table = document.createElement('table');
                document.addEventListener('pointerup', () => this.isSelecting = false);
                table.classList.add('k-table');
                table.onkeydown = (evt) => {
                    switch (evt.code) {
                        case 'ArrowUp':
                            this.moveBy(0, -1);
                            break;
                        case 'ArrowLeft':
                            this.moveBy(-1, 0);
                            break;
                        case 'ArrowDown':
                            this.moveBy(0, 1);
                            break;
                        case 'ArrowRight':
                            this.moveBy(1, 0);
                            break;
                        case 'F2':
                            this.cell.startEdit();
                            break;
                        default:
                            if (/^[\w\d=*\/\-+,.]$/.test(evt.key)) {
                                this.cell.text = '';
                                this.cell.startEdit();
                            }
                    }
                };
                this._columns.header.render(table);
                let tbody = document.createElement('tbody');
                this._rows.render(tbody);
                table.appendChild(tbody);
                this._el.appendChild(table);
                return table;
            }
            get cell() {
                return this.cellBegin;
            }
            startSelection(cell) {
                this.clearSelection();
                this.cellBegin = cell;
                this.endSelection(cell);
            }
            endSelection(cell) {
                this.clearSelection();
                console.log('end selection');
                this.cellEnd = cell;
                this.updateSelection();
            }
            updateSelection() {
                let cells = [];
                let x1 = this.cellBegin.x;
                let x2 = this.cellEnd.x;
                let y1 = this.cellBegin.y;
                let y2 = this.cellEnd.y;
                if (x2 < x1) {
                    let t = x2;
                    x2 = x1;
                    x1 = t;
                }
                if (y2 < y1) {
                    let t = y2;
                    y2 = y1;
                    y1 = t;
                }
                for (let y = y1; y <= y2; y++)
                    for (let x = x1; x <= x2; x++) {
                        let cell = this._rows[y][x];
                        cells.push(cell);
                        cell.selected = true;
                    }
                this._selection = cells;
            }
            clearSelection() {
                if (this.cell && this.cell.editing)
                    this.cell.stopEdit(true);
                if (this._selection)
                    for (let cell of this._selection)
                        cell.selected = false;
            }
            get columns() {
                return this._columns;
            }
            get isLoading() {
                return this._isLoading;
            }
        }
        Grid.CustomTable = CustomTable;
    })(Grid = Katrid.Grid || (Katrid.Grid = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Services;
    (function (Services) {
        let $fetch = window.fetch;
        window.fetch = function () {
            let ajaxStart = new CustomEvent('ajax.start', { detail: document, 'bubbles': true, 'cancelable': false });
            let ajaxStop = new CustomEvent('ajax.stop', { detail: document, 'bubbles': true, 'cancelable': false });
            let promise = $fetch.apply(this, arguments);
            document.dispatchEvent(ajaxStart);
            promise.finally(() => {
                document.dispatchEvent(ajaxStop);
            });
            return promise;
        };
        class Service {
            constructor(name) {
                this.name = name;
            }
            static get url() {
                return '/api/rpc/';
            }
            ;
            static $fetch(url, config, params) {
                if (params) {
                    url = new URL(url);
                    Object.entries(params).map((k, v) => url.searchParams.append(k, v));
                }
                $(Katrid).trigger('fetch.before');
                return fetch(url, config)
                    .then(response => {
                    $(Katrid).trigger('fetch.done');
                    return response;
                });
            }
            static $post(url, data, params) {
                return this.$fetch(url, {
                    method: 'POST',
                    credentials: "same-origin",
                    body: JSON.stringify(data),
                    headers: {
                        'content-type': 'application/json',
                    }
                }, params)
                    .then(res => res.json());
            }
            delete(name, params, data) {
            }
            get(name, params) {
                const methName = this.name ? this.name + '/' : '';
                const rpcName = Katrid.settings.server + this.constructor.url + methName + name + '/';
                return $.get(rpcName, params);
            }
            post(name, data, params, config) {
                let context;
                if (Katrid.app)
                    context = Katrid.app.context;
                if (!data)
                    data = {};
                if (context)
                    data.context = context;
                data = {
                    method: name,
                    params: data,
                };
                if (!config)
                    config = {};
                Object.assign(config, {
                    method: 'POST',
                    body: JSON.stringify(data),
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                });
                const methName = this.name ? this.name + '/' : '';
                let rpcName = Katrid.settings.server + this.constructor.url + methName + name + '/';
                if (params) {
                    rpcName += `?${$.param(params)}`;
                }
                return new Promise((resolve, reject) => {
                    fetch(rpcName, config)
                        .then(async (res) => {
                        if (res.status === 500) {
                            throw Error(await res.text());
                        }
                        return res;
                    })
                        .then(res => res.json())
                        .then(res => {
                        if (res.error)
                            reject(res.error);
                        else {
                            if (res.result) {
                                let messages;
                                if (res.result.messages)
                                    messages = res.result.messages;
                                else
                                    messages = [];
                                if (res.result.message)
                                    messages.push(res.result.message);
                                else if (res.result.warn)
                                    messages.push({ type: 'warn', message: res.result.warn });
                                else if (res.result.info)
                                    messages.push({ type: 'info', message: res.result.info });
                                else if (res.result.error)
                                    messages.push({ type: 'error', message: res.result.error });
                                messages.forEach(function (msg) {
                                    if (_.isString(msg))
                                        Katrid.Forms.Dialogs.Alerts.success(msg);
                                    else if (msg.type === 'warn')
                                        Katrid.Forms.Dialogs.Alerts.warn(msg.message);
                                    else if (msg.type === 'info')
                                        Katrid.Forms.Dialogs.Alerts.info(msg.message);
                                    else if ((msg.type === 'error') || (msg.type === 'danger'))
                                        Katrid.Forms.Dialogs.Alerts.error(msg.message);
                                });
                            }
                            resolve(res.result);
                        }
                    })
                        .catch(res => reject(res));
                });
            }
        }
        Services.Service = Service;
        class Data extends Service {
            static get url() {
                return '/web/data/';
            }
            ;
            reorder(model, ids, field = 'sequence', offset = 0) {
                return this.post('reorder', { args: [model, ids, field, offset] });
            }
        }
        Services.Data = Data;
        class Attachments {
            static destroy(id) {
                let svc = new Katrid.Services.Model('ir.attachment');
                svc.destroy(id);
            }
            static upload(file, scope = null) {
                let data = new FormData();
                if (!scope)
                    scope = angular.element(file).scope();
                console.log(file);
                data.append('model', scope.model.name);
                data.append('id', scope.recordId);
                for (let f of file.files)
                    data.append('attachment', f, f.name);
                return $.ajax({
                    url: '/web/content/upload/',
                    type: 'POST',
                    data: data,
                    processData: false,
                    contentType: false
                })
                    .done((res) => {
                    if (!scope.attachments)
                        scope.attachments = [];
                    if (res && res.result)
                        for (let obj of res.result)
                            scope.attachments.push(obj);
                    scope.$apply();
                });
            }
        }
        Services.Attachments = Attachments;
        class Auth extends Service {
            static login(username, password) {
                return this.$post('/web/login/', { username: username, password: password });
            }
        }
        class Upload {
            static sendFile(service, file) {
                let form = new FormData();
                form.append('files', file.files[0]);
                let scope = angular.element(file).scope();
                let url = `/web/file/upload/${scope.model.name}/${service}/`;
                if (scope.record && scope.record.id)
                    form.append('id', scope.record.id);
                let dataSource = scope.action.dataSource;
                if (!dataSource) {
                    dataSource = scope.$parent.dataSource;
                    let s = scope.$parent;
                    while (s) {
                        dataSource = s.dataSource;
                        if (dataSource)
                            break;
                        s = scope.$parent;
                    }
                }
                $.ajax({
                    url: url,
                    data: form,
                    processData: false,
                    contentType: false,
                    type: 'POST',
                    success: (data) => {
                        dataSource.refresh();
                        Katrid.Forms.Dialogs.Alerts.success('Operação realizada com sucesso.');
                    }
                });
            }
            static uploadTo(url, file) {
                let form = new FormData();
                form.append('files', file.files[0]);
                return $.ajax({
                    url: url,
                    data: form,
                    processData: false,
                    contentType: false,
                    type: 'POST',
                    success: (data) => {
                        Katrid.Forms.Dialogs.Alerts.success('Arquivo enviado com sucesso!');
                    }
                });
            }
        }
        Services.Upload = Upload;
        Services.data = new Data('');
        function post(url, data) {
            return fetch(url, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
            }).then(res => res.json());
        }
        Services.post = post;
    })(Services = Katrid.Services || (Katrid.Services = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Services;
    (function (Services) {
        class Model extends Services.Service {
            searchName(kwargs) {
                return this.post('search_name', kwargs);
            }
            createName(name) {
                let kwargs = { name };
                return this.post('create_name', { kwargs: kwargs });
            }
            search(data, params, config) {
                return this.post('search', { kwargs: data }, params, config);
            }
            destroy(id) {
                if (!_.isArray(id))
                    id = [id];
                return this.post('destroy', { kwargs: { ids: id } });
            }
            getById(id, config) {
                return this.post('get', { args: [id] }, null, config);
            }
            getDefaults(kwargs, config) {
                return this.post('get_defaults', { kwargs }, null, config);
            }
            copy(id) {
                return this.post('copy', { args: [id] });
            }
            static _prepareFields(res) {
                if (res) {
                    res.fields = Katrid.Data.Fields.fromArray(res.fields);
                    res.fieldList = Object.values(res.fields);
                    if (res.views) {
                        Object.values(res.views).map((v) => v.fields = Katrid.Data.Fields.fromArray(v.fields));
                        Object.keys(res.views).map(k => res.views[k] = new Katrid.Forms.Views.ViewInfo(res.views[k]));
                    }
                }
                return res;
            }
            getViewInfo(data) {
                return this.post('get_view_info', { kwargs: data })
                    .then(this.constructor._prepareFields);
            }
            async loadViews(data) {
                return this.post('load_views', { kwargs: data })
                    .then(this.constructor._prepareFields);
            }
            getFieldsInfo(data) {
                return this.post('get_fields_info', { kwargs: data })
                    .then(this.constructor._prepareFields);
            }
            getFieldChoices(field, term, kwargs) {
                return this.post('get_field_choices', { args: [field, term], kwargs: kwargs });
            }
            doViewAction(data) {
                return this.post('do_view_action', { kwargs: data });
            }
            write(data, params) {
                return new Promise((resolve, reject) => {
                    this.post('write', { kwargs: { data } }, params)
                        .then((res) => {
                        Katrid.Forms.Dialogs.Alerts.success(Katrid.i18n.gettext('Record saved successfully.'));
                        resolve(res);
                    })
                        .catch(res => {
                        if ((res.status === 500) && res.responseText)
                            alert(res.responseText);
                        else
                            Katrid.Forms.Dialogs.Alerts.error(Katrid.i18n.gettext('Error saving record changes'));
                        reject(res);
                    });
                });
            }
            groupBy(grouping, params) {
                return this.post('group_by', { kwargs: { grouping, params } });
            }
            autoReport() {
                return this.post('auto_report', { kwargs: {} });
            }
            rpc(meth, args, kwargs) {
                return new Promise((resolve, reject) => {
                    this.post(meth, { args: args, kwargs: kwargs })
                        .then((res) => {
                        if (res && res.open)
                            window.open(res.open);
                        resolve(res);
                    })
                        .catch(res => {
                        if (res.messages && _.isObject(res.messages)) {
                            for (let msg of Object.values(res.messages))
                                Katrid.Forms.Dialogs.Alerts.error(msg.join('\n'));
                        }
                        else
                            Katrid.Forms.Dialogs.Alerts.error(res.message);
                        reject(res);
                    });
                });
            }
        }
        Services.Model = Model;
        class Query extends Model {
            constructor() {
                super('ir.query');
            }
            static read(config) {
                let details, id, params;
                if (_.isObject(config)) {
                    details = config.details;
                    params = config.params;
                    id = config.id;
                }
                else
                    id = config;
                return (new Query()).post('read', {
                    args: [id],
                    kwargs: {
                        with_description: details, params, as_dict: config.as_dict
                    }
                });
            }
            static all() {
                return (new Query()).rpc('all');
            }
            static executeSql(sql) {
                return (new Query()).post('execute_sql', { args: [sql] });
            }
        }
        Services.Query = Query;
        class View extends Model {
            constructor() {
                super('ui.view');
            }
            fromModel(model) {
                return this.post('from_model', null, { model });
            }
        }
        class Actions extends Model {
            static load(action) {
                let svc = new Model('ir.action');
                return svc.post('load', { args: [action] });
            }
        }
        Services.Actions = Actions;
    })(Services = Katrid.Services || (Katrid.Services = {}));
})(Katrid || (Katrid = {}));
(function () {
    class FileManager {
        constructor(opts) {
            this.$element = opts.el;
            this.$scope = opts.scope;
            this.service = this.$element.attr('service');
            $.get(this.service)
                .then(res => {
                this.$scope.dirs = res.content.filter(obj => obj.type === 'dir');
                this.$scope.files = res.content.filter(obj => obj.type === 'file');
                this.$scope.items = res.content;
                this.$scope.levels[this.$scope.level] = this.$scope.items;
                this.$scope.$apply();
            });
        }
        getPath(item) {
            let url = item.name;
            let parent = item.parent;
            while (parent) {
                url = parent.name + '/' + url;
                parent = parent.parent;
            }
            return url;
        }
        expand(item) {
            let url = this.getPath(item);
            url = this.service + '?path=' + url;
            $.get(url)
                .then(res => {
                this.$scope.items = res.content;
                this.$scope.dirs = res.content.filter(obj => obj.type === 'dir');
                this.$scope.files = res.content.filter(obj => obj.type === 'file');
                res.content.map(obj => obj.parent = item);
                this.$scope.levels[this.$scope.level] = this.$scope.items;
                this.$scope.$apply();
            });
        }
    }
    Katrid.UI.uiKatrid.directive('fileManager', () => ({
        restrict: 'E',
        scope: {},
        templateUrl: 'file-manager.jinja2',
        link(scope, el) {
            scope.level = 0;
            scope.levels = {};
            let fm = new FileManager({ el, scope });
            scope.expand = item => {
                scope.level++;
                scope.currentItem = item;
                fm.expand(item);
                scope.currentPath = fm.getPath(item);
            };
            scope.backTo = level => {
                scope.level = level;
                console.log('back to', level);
                scope.items = scope.levels[scope.level];
                scope.dirs = scope.items.filter(obj => obj.type === 'dir');
                scope.files = scope.items.filter(obj => obj.type === 'file');
                scope.currentPath = fm.getPath(scope.items[0]);
            };
            scope.uploadFile = file => {
                console.log('current path', scope.currentPath);
                Katrid.Services.Upload.uploadTo('/pwapec/file-manager/upload/?path=' + (scope.currentPath || ''), file)
                    .then(() => {
                    fm.expand(scope.currentItem);
                });
            };
        }
    }));
})();
(function () {
    class QueryManager {
        constructor(app) {
            this.app = app;
            this.$scope = app.$scope.$new();
            this.$scope.queryChange = (query) => this.queryChange(query);
            this.$scope.search = {};
            let me = this;
            this.action = this.$scope.action = {
                context: {},
                views: {},
                async saveSearch(search) {
                    let svc = new Katrid.Services.Model('ui.filter');
                    let data = {};
                    Object.assign(data, search);
                    data.query = me.$scope.query.id;
                    if (search.name === null) {
                        search.name = prompt('Query name', 'current query namne');
                        search.is_default = false;
                        search.is_shared = true;
                    }
                    if (search.name)
                        await svc.write([data]);
                },
                setSearchParams(params) {
                    me.$scope.search.params = params;
                    me.refresh(me.query);
                },
                switchView(viewType) {
                    console.log('set view type', viewType);
                },
                orderBy(field) {
                    if (me.$scope.ordering === field)
                        me.$scope.reverse = !me.$scope.reverse;
                    else {
                        me.$scope.ordering = field;
                        me.$scope.reverse = false;
                    }
                }
            };
        }
        getFilter(field) {
            if (field.type === 'DateField')
                return "|date:'shortDate'";
            else if (field.type === 'DateTimeField')
                return "|date:'short'";
            else if (field.type === 'IntegerField')
                return "|number:0";
            return "";
        }
        getSearchView(query) {
            let s;
            if (query.params)
                s = query.params;
            else {
                s = `<search>`;
                for (let f of query.fields)
                    s += `<field name="${f.name}"/>`;
                s += '</search>';
            }
            let fields = {};
            for (let f of query.fields)
                fields[f.name] = Katrid.Data.Fields.Field.fromInfo(f);
            this.fields = fields;
            return { content: s, fields };
        }
        async queryChange(query) {
            this.$scope.search = {
                viewMoreButtons: true,
            };
            this.query = query;
            let res = await this.refresh(query);
            query.fields = res.fields;
            this.action.search = this.getSearchView(query);
            this.action.fieldList = Object.values(this.fields);
            this.$scope.action.views.search = this.$scope.action.search;
            this.renderSearch();
            this.renderTable(res);
            this.$scope.$apply();
        }
        async refresh(query) {
            let res = await Katrid.Services.Query.read({ id: query.id, details: true, params: this.$scope.search.params });
            for (let f of res.fields)
                f.filter = this.getFilter(f);
            let _toObject = (fields, values) => {
                let r = {}, i = 0;
                for (let f of fields) {
                    r[f.name] = values[i];
                    i++;
                }
                return r;
            };
            this.$scope.records = res.data.map(row => _toObject(res.fields, row));
            this.$scope.$apply();
            return res;
        }
        renderSearch() {
            let el = this.app.getTemplate('query.manager.search.jinja2');
            el = Katrid.Core.$compile(el)(this.$scope);
            this.$element.find('#query-search-view').html(el);
        }
        async render() {
            let templ = this.app.getTemplate('query.manager.jinja2');
            templ = Katrid.Core.$compile(templ)(this.$scope);
            this.$element = templ;
            let queries = await Katrid.Services.Query.all();
            this.$scope.queries = queries.data;
            this.app.$element.html(templ);
            this.$scope.$apply();
        }
        renderTable(data) {
            let templ = this.app.getTemplate('query.manager.table.jinja2', {
                self: this, query: this.$scope.query, records: this.records, fields: Object.values(this.fields),
            });
            templ = Katrid.Core.$compile(templ)(this.$scope);
            initColumn(templ);
            this.$element.find('#query-manager-result').html(templ);
        }
    }
    Katrid.Core.plugins.register((app) => {
        $(app).on('hashchange', (event, hash) => {
            if (hash.startsWith('#/app/query.manager/')) {
                event.stopPropagation();
                event.preventDefault();
                app.$scope.$parent.currentMenu = { name: 'Query Manager' };
                let q = new QueryManager(app);
                q.render();
            }
        });
    });
    function initColumn(table) {
    }
    function reorder(index1, index2) {
        $('table tr').each(function () {
            var tr = $(this);
            var td1 = tr.find(`td:eq(${index1})`);
            var td2 = tr.find(`td:eq(${index2})`);
            td1.detach().insertAfter(td2);
        });
    }
})();
var Katrid;
(function (Katrid) {
    var Reports;
    (function (Reports) {
        let _counter = 0;
        class Params {
        }
        Params.Operations = {
            exact: 'exact',
            in: 'in',
            contains: 'contains',
            startswith: 'startswith',
            endswith: 'endswith',
            gt: 'gt',
            lt: 'lt',
            between: 'between',
            isnull: 'isnull'
        };
        Params.Labels = null;
        Params.DefaultOperations = {
            CharField: Params.Operations.exact,
            IntegerField: Params.Operations.exact,
            DateTimeField: Params.Operations.between,
            DateField: Params.Operations.between,
            FloatField: Params.Operations.between,
            DecimalField: Params.Operations.between,
            ForeignKey: Params.Operations.exact,
            ModelChoices: Params.Operations.exact,
            SelectionField: Params.Operations.exact,
        };
        Params.TypeOperations = {
            CharField: [Params.Operations.exact, Params.Operations.in, Params.Operations.contains, Params.Operations.startswith, Params.Operations.endswith, Params.Operations.isnull],
            IntegerField: [Params.Operations.exact, Params.Operations.in, Params.Operations.gt, Params.Operations.lt, Params.Operations.between, Params.Operations.isnull],
            FloatField: [Params.Operations.exact, Params.Operations.in, Params.Operations.gt, Params.Operations.lt, Params.Operations.between, Params.Operations.isnull],
            DecimalField: [Params.Operations.exact, Params.Operations.in, Params.Operations.gt, Params.Operations.lt, Params.Operations.between, Params.Operations.isnull],
            DateTimeField: [Params.Operations.exact, Params.Operations.in, Params.Operations.gt, Params.Operations.lt, Params.Operations.between, Params.Operations.isnull],
            DateField: [Params.Operations.exact, Params.Operations.in, Params.Operations.gt, Params.Operations.lt, Params.Operations.between, Params.Operations.isnull],
            ForeignKey: [Params.Operations.exact, Params.Operations.in, Params.Operations.isnull],
            ModelChoices: [Params.Operations.exact, Params.Operations.in, Params.Operations.isnull],
            SelectionField: [Params.Operations.exact, Params.Operations.isnull],
        };
        Params.Widgets = {
            CharField(param) {
                return `<div><input id="rep-param-id-${param.id}" ng-model="param.value1" type="text" class="form-control"></div>`;
            },
            IntegerField(param) {
                let secondField = '';
                if (param.operation === 'between') {
                    secondField = `<div class="col-sm-6"><input id="rep-param-id-${param.id}-2" ng-model="param.value2" type="number" class="form-control"></div>`;
                }
                return `<div class="row"><div class="col-sm-6"><input id="rep-param-id-${param.id}" type="number" ng-model="param.value1" class="form-control"></div>${secondField}</div>`;
            },
            DecimalField(param) {
                let secondField = '';
                if (param.operation === 'between') {
                    secondField = `<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" ng-model="param.value2" input-decimal class="form-control"></div>`;
                }
                return `<div class="col-sm-12 row"><div class="col-xs-6"><input id="rep-param-id-${param.id}" input-decimal ng-model="param.value1" class="form-control"></div>${secondField}</div>`;
            },
            DateTimeField(param) {
                let secondField = '';
                if (param.operation === 'between') {
                    secondField = `<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" type="text" date-picker="L" ng-model="param.value2" class="form-control"></div>`;
                }
                return `<div class="col-sm-12 row"><div class="col-xs-6"><input id="rep-param-id-${param.id}" type="text" date-picker="L" ng-model="param.value1" class="form-control"></div>${secondField}</div>`;
            },
            DateField(param) {
                let secondField = '';
                if (param.operation === 'between') {
                    secondField = `<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" type="text" date-picker="L" ng-model="param.value2" class="form-control"></div>`;
                }
                return `<div class="col-sm-12 row"><div class="col-xs-6"><input id="rep-param-id-${param.id}" type="text" date-picker="L" ng-model="param.value1" class="form-control"></div>${secondField}</div>`;
            },
            ForeignKey(param) {
                const serviceName = param.info.field.attr('model') || param.params.model;
                let multiple = '';
                if (param.operation === 'in') {
                    multiple = 'multiple';
                }
                return `<div><input id="rep-param-id-${param.id}" ajax-choices="${serviceName}" field="${param.name}" ng-model="param.value1" ${multiple}></div>`;
            },
            ModelChoices(param) {
                let multiple = '';
                if (param.operation === 'in') {
                    multiple = 'multiple';
                }
                return `<div><input id="rep-param-id-${param.id}" ajax-choices="ir.action.report" model-choices="${param.info.modelChoices}" ng-model="param.value1" ${multiple}></div>`;
            },
            SelectionField(param) {
                param.info.choices = param.info.field.data('choices');
                let defaultValue = param.info.field.attr('default');
                if (defaultValue)
                    defaultValue = ` ng-init="param.value1='${defaultValue}'"`;
                if (!param.info.choices) {
                    param.info.choices = {};
                    for (let child of param.info.field.find('option')) {
                        child = $(child);
                        param.info.choices[child.attr('value')] = child.text();
                    }
                }
                return `<div${defaultValue}><select class="form-control" ng-model="param.value1"><option value="\${ key }" ng-repeat="(key, value) in fields.${param.name}.choices">\${ value }</option></select></div>`;
            }
        };
        Reports.Params = Params;
        class Param {
            constructor(info, params) {
                this.info = info;
                this.params = params;
                this.name = this.info.name;
                this.field = this.params.info.fields && this.params.info.fields[this.name];
                this.label = this.info.label || this.params.info.caption;
                this.static = this.info.param === 'static';
                this.type = this.info.type || (this.field && this.field.type) || 'CharField';
                this.defaultOperation = this.info.operation || Params.DefaultOperations[this.type];
                this.operation = this.defaultOperation;
                this.operations = this.getOperations();
                this.exclude = this.info.exclude;
                this.id = ++_counter;
            }
            defaultValue() {
                return null;
            }
            setOperation(op, focus) {
                if (focus == null) {
                    focus = true;
                }
                this.createControls(this.scope);
                const el = this.el.find(`#rep-param-id-${this.id}`);
                if (focus) {
                    el.focus();
                }
            }
            createControls(scope) {
                const el = this.el.find(".param-widget");
                el.empty();
                let widget = Params.Widgets[this.type](this);
                widget = Katrid.Core.$compile(widget)(scope);
                return el.append(widget);
            }
            getOperations() {
            }
            operationTemplate() {
                const opts = this.getOperations();
                return `<div class="col-sm-4"><select id="param-op-${this.id}" ng-model="param.operation" ng-init="param.operation='${this.defaultOperation}'" class="form-control" onchange="$('#param-${this.id}').data('param').change();$('#rep-param-id-${this.id}')[0].focus()">
  ${opts}
  </select></div>`;
            }
            template() {
                let operation = '';
                if (!this.operation)
                    operation = this.operationTemplate();
                return `<div id="param-${this.id}" class="row form-group" data-param="${this.name}" ng-controller="ParamController"><label class="control-label">${this.label}</label>${operation}<div id="param-widget-${this.id}"></div></div>`;
            }
            render(container) {
                this.el = this.params.scope.compile(this.template())(this.params.scope);
                this.el.data('param', this);
                console.log('render param');
                this.createControls(this.el.scope());
                return container.append(this.el);
            }
        }
        Reports.Param = Param;
        Katrid.UI.uiKatrid.controller('ReportController', ['$scope', '$element', '$compile', function ($scope, $element, $compile) {
                const xmlReport = $scope.$parent.action.info.content;
                const report = new Reports.Report($scope.$parent.action, $scope);
                $scope.report = report;
                console.log($scope.$parent.action);
                report.loadFromXml(xmlReport);
                report.render($element);
                return report.loadParams();
            }]);
        Katrid.UI.uiKatrid.controller('ReportParamController', ['$scope', '$element', function ($scope, $element) {
                $scope.$parent.param.el = $element;
                $scope.$parent.param.scope = $scope;
                return $scope.$parent.param.setOperation($scope.$parent.param.operation, false);
            }]);
        class ReportEngine {
            static load(el) {
                $('row').each((idx, el) => {
                    el.addClass('row');
                });
                $('column').each((idx, el) => {
                    el.addClass('col');
                });
            }
        }
        Reports.ReportEngine = ReportEngine;
    })(Reports = Katrid.Reports || (Katrid.Reports = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Reports;
    (function (Reports) {
        let _counter = 0;
        Reports.currentReport = {};
        Reports.currentUserReport = {};
        function renderDialog(action) {
            console.log(action);
            return Katrid.app.getTemplate('view.report.jinja2', { action: action });
        }
        Reports.renderDialog = renderDialog;
        class Report {
            constructor(action, scope) {
                this.action = action;
                this.scope = scope;
                this.info = this.action.info;
                Reports.currentReport = this;
                if ((Reports.Params.Labels == null)) {
                    Reports.Params.Labels = {
                        exact: Katrid.i18n.gettext('Is equal'),
                        in: Katrid.i18n.gettext('Selection'),
                        contains: Katrid.i18n.gettext('Contains'),
                        startswith: Katrid.i18n.gettext('Starting with'),
                        endswith: Katrid.i18n.gettext('Ending with'),
                        gt: Katrid.i18n.gettext('Greater-than'),
                        lt: Katrid.i18n.gettext('Less-than'),
                        between: Katrid.i18n.gettext('Between'),
                        isnull: Katrid.i18n.gettext('Is Null')
                    };
                }
                this.name = this.info.name;
                this.id = ++_counter;
                this.values = {};
                this.params = [];
                this.filters = [];
                this.groupables = [];
                this.sortables = [];
                this.totals = [];
            }
            telegram() {
            }
            getUserParams() {
                let report = this;
                let params = {
                    data: [],
                    file: report.container.find('#id-report-file').val()
                };
                for (let p of Array.from(this.params)) {
                    params.data.push({
                        name: p.name,
                        op: p.operation,
                        value1: p.value1,
                        value2: p.value2,
                        type: p.type
                    });
                }
                let fields = report.container.find('#report-id-fields').val();
                params['fields'] = fields;
                let totals = report.container.find('#report-id-totals').val();
                params['totals'] = totals;
                let sorting = report.container.find('#report-id-sorting').val();
                params['sorting'] = sorting;
                let grouping = report.container.find('#report-id-grouping').val();
                params['grouping'] = grouping;
                return params;
            }
            loadFromXml(xml) {
                let dataTypeDict = {
                    date: 'DateField',
                    datetime: 'DateTimeField',
                };
                if (_.isString(xml)) {
                    xml = $(xml);
                }
                this.scope.customizableReport = xml.attr('customizableReport');
                this.scope.advancedOptions = xml.attr('advancedOptions');
                this.model = xml.attr('model');
                const fields = [];
                for (let f of Array.from(xml.find('param,field'))) {
                    let tag = f.tagName;
                    f = $(f);
                    const name = f.attr('name');
                    console.log(this.info);
                    let fld;
                    if (this.info.fields)
                        fld = this.info.fields[name];
                    const label = f.attr('label') || f.attr('caption') || (fld && fld.caption) || name;
                    const groupable = f.attr('groupable');
                    const sortable = f.attr('sortable');
                    const total = f.attr('total');
                    let param = f.attr('param');
                    if ((tag === 'FIELD') && (!param))
                        param = 'static';
                    const required = f.attr('required');
                    const autoCreate = f.attr('autoCreate') || required || (param === 'static');
                    const operation = f.attr('operation');
                    let type = f.attr('type') || f.data('type') || (fld && fld.type);
                    if (type in dataTypeDict)
                        type = dataTypeDict[type];
                    const modelChoices = f.attr('model-choices');
                    if (!type && modelChoices)
                        type = 'ModelChoices';
                    fields.push({
                        name,
                        label,
                        groupable,
                        sortable,
                        total,
                        param,
                        required,
                        operation,
                        modelChoices,
                        type,
                        autoCreate,
                        field: f,
                    });
                }
                const params = (Array.from(xml.find('param')).map((p) => $(p).attr('name')));
                return this.load(fields, params);
            }
            saveDialog() {
                const params = this.getUserParams();
                const name = window.prompt(Katrid.i18n.gettext('Report name'), Katrid.Reports.currentUserReport.name);
                if (name) {
                    Katrid.Reports.currentUserReport.name = name;
                    $.ajax({
                        type: 'POST',
                        url: this.container.find('#report-form').attr('action') + '?save=' + name,
                        contentType: "application/json; charset=utf-8",
                        dataType: 'json',
                        data: JSON.stringify(params)
                    });
                }
                return false;
            }
            load(fields, params) {
                if (!fields) {
                    ({ fields } = this.info);
                }
                if (!params) {
                    params = [];
                }
                this.fields = fields;
                this.scope.fields = {};
                for (let p of fields) {
                    this.scope.fields[p.name] = p;
                    if (p.groupable)
                        this.groupables.push(p);
                    if (p.sortable)
                        this.sortables.push(p);
                    if (p.total)
                        this.totals.push(p);
                    if (!p.autoCreate)
                        p.autoCreate = params.includes(p.name);
                }
            }
            loadParams() {
                for (let p of Array.from(this.fields)) {
                    if (p.autoCreate)
                        this.addParam(p.name);
                }
            }
            addParam(paramName, value) {
                for (let p of Array.from(this.fields))
                    if (p.name === paramName) {
                        p = new Reports.Param(p, this);
                        this.params.push(p);
                        break;
                    }
            }
            getValues() { }
            export(format) {
                if (format == null)
                    format = localStorage.katridReportViewer || 'pdf';
                const params = this.getUserParams();
                console.log('send params', params);
                const svc = new Katrid.Services.Model('ir.action.report');
                svc.post('export_report', { args: [this.info.id], kwargs: { format, params } })
                    .then(function (res) {
                    if (res.open) {
                        return window.open(res.open);
                    }
                });
                return false;
            }
            preview() {
                return this.export(localStorage.katridReportViewer);
            }
            renderFields() {
                let p;
                let el = $('<div></div>');
                const flds = this.fields.map((p) => `<option value="${p.name}">${p.label}</option>`).join('');
                const aggs = ((() => {
                    const result1 = [];
                    for (p of Array.from(this.fields)) {
                        if (p.total) {
                            result1.push(`<option value="${p.name}">${p.label}</option>`);
                        }
                    }
                    return result1;
                })()).join('');
                el = this.container.find('#report-params');
                let sel = el.find('#report-id-fields');
                sel.append($(flds))
                    .select2({ tags: ((() => {
                        const result2 = [];
                        for (let p of Array.from(this.fields))
                            result2.push({ id: p.name, text: p.label });
                        return result2;
                    })()) });
                if (Katrid.Reports.currentUserReport.params && Katrid.Reports.currentUserReport.params.fields) {
                    console.log(Katrid.Reports.currentUserReport.params.fields);
                    sel.select2('val', Katrid.Reports.currentUserReport.params.fields);
                }
                sel = el.find('#report-id-totals');
                sel.append(aggs)
                    .select2({ tags: ((() => {
                        const result3 = [];
                        for (let p of Array.from(this.fields)) {
                            if (p.total) {
                                result3.push({ id: p.name, text: p.label });
                            }
                        }
                        return result3;
                    })()) });
                return el;
            }
            renderParams(container) {
                let p;
                let el = $('<div></div>');
                this.elParams = el;
                let loaded = {};
                const userParams = Katrid.Reports.currentUserReport.params;
                if (userParams && userParams.data) {
                    for (let p of Array.from(userParams.data)) {
                        loaded[p.name] = true;
                        this.addParam(p.name, p.value);
                    }
                }
                for (p of Array.from(this.params)) {
                    if (p.static && !loaded[p.name]) {
                        $(p.render(el));
                    }
                }
                return container.find('#params-params').append(el);
            }
            renderGrouping(container) {
                const opts = (Array.from(this.groupables).map((p) => `<option value="${p.name}">${p.label}</option>`)).join('');
                const el = container.find("#params-grouping");
                const sel = el.find('select').select2();
                return sel.append(opts)
                    .select2("container").find("ul.select2-choices").sortable({
                    containment: 'parent',
                    start() { return sel.select2("onSortStart"); },
                    update() { return sel.select2("onSortEnd"); }
                });
            }
            renderSorting(container) {
                const opts = (Array.from(this.sortables).filter((p) => p.sortable).map((p) => `<option value="${p.name}">${p.label}</option>`)).join('');
                const el = container.find("#params-sorting");
                const sel = el.find('select').select2();
                return sel.append(opts)
                    .select2("container").find("ul.select2-choices").sortable({
                    containment: 'parent',
                    start() { return sel.select2("onSortStart"); },
                    update() { return sel.select2("onSortEnd"); }
                });
            }
            render(container) {
                this.container = container;
                let el = this.renderFields();
                if (this.sortables.length) {
                    el = this.renderSorting(container);
                }
                else {
                    container.find("#params-sorting").hide();
                }
                if (this.groupables.length) {
                    el = this.renderGrouping(container);
                }
                else {
                    container.find("#params-grouping").hide();
                }
                return el = this.renderParams(container);
            }
        }
        Reports.Report = Report;
    })(Reports = Katrid.Reports || (Katrid.Reports = {}));
})(Katrid || (Katrid = {}));
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        class WebApplication extends HTMLElement {
            connectedCallback() {
            }
        }
        Forms.WebApplication = WebApplication;
        Katrid.define('web-application', WebApplication);
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
(function () {
    Katrid.UI.uiKatrid
        .directive('codeEditor', [function () {
            return {
                restrict: 'EA',
                require: 'ngModel',
                link: function (scope, elm, attrs, ngModel) {
                    let editor;
                    require.config({
                        paths: {
                            vs: '/static/web/monaco/min/vs',
                        }
                    });
                    console.log('set language', attrs.language);
                    require(['vs/editor/editor.main'], function () {
                        editor = monaco.editor.create(elm[0], {
                            value: '',
                            language: attrs.language || 'xml',
                            minimap: {
                                enabled: false,
                            },
                            automaticLayout: true,
                        });
                        editor.getModel().onDidChangeContent(evt => {
                            ngModel.$setViewValue(editor.getValue());
                        });
                        ngModel.$render = function () {
                            setTimeout(() => {
                                editor.setValue(ngModel.$viewValue);
                            }, 300);
                        };
                    });
                }
            };
        }]);
})();
(function () {
    let uiKatrid = Katrid.UI.uiKatrid;
    let formCount = 0;
    uiKatrid.directive('formField2', ['$compile', function ($compile) {
            return {
                restrict: 'A',
                priority: 99,
                replace: true,
                compile(el, attrs) {
                    return function (scope, element, attrs, ctrl) {
                        let field = scope.view.fields[attrs.name];
                        if (_.isUndefined(field))
                            throw Error('Invalid field name "' + attrs.name + '"');
                        let templ = field.template.form;
                        field.assign(element);
                        if (!field.visible) {
                            el.remove();
                            return;
                        }
                        let fieldAttributes = field.getAttributes(attrs);
                        let sectionAttrs = {};
                        if (fieldAttributes['ng-readonly'])
                            sectionAttrs['ng-readonly'] = fieldAttributes['ng-readonly'].toString();
                        if (attrs.ngShow)
                            sectionAttrs['ng-show'] = attrs.ngShow;
                        if (field.helpText) {
                            sectionAttrs['title'] = field.helpText;
                        }
                        let content = element.html();
                        templ = Katrid.app.getTemplate(templ, {
                            name: attrs.name, field, attrs: fieldAttributes, content, fieldAttributes: attrs, sectionAttrs,
                        });
                        templ = $compile(templ)(scope);
                        element.replaceWith(templ);
                        let fcontrol = templ.find('.form-field');
                        if (fcontrol.length) {
                            fcontrol = fcontrol[fcontrol.length - 1];
                            const form = templ.controller('form');
                            ctrl = angular.element(fcontrol).data().$ngModelController;
                            if (ctrl)
                                form.$addControl(ctrl);
                        }
                    };
                },
            };
        }]);
    uiKatrid.directive('inputField', () => ({
        restrict: 'A',
        scope: false,
        link(scope, element, attrs) {
            $(element).on('click', function () {
                $(this).select();
            });
        }
    }));
    uiKatrid.directive('view', () => ({
        restrict: 'E',
        template(element, attrs) {
            formCount++;
            return '';
        },
        link(scope, element, attrs) {
            if (scope.model) {
                element.attr('class', `view-form-${scope.model.name.replace(new RegExp('\.', 'g'), '-')}`);
                element.attr('id', `katrid-form-${formCount.toString()}`);
                element.attr('model', scope.model);
                return element.attr('name', `dataForm${formCount.toString()}`);
            }
        }
    }));
    uiKatrid.directive('ngSum', () => ({
        restrict: 'A',
        priority: 9999,
        require: 'ngModel',
        link(scope, element, attrs, controller) {
            const nm = attrs.ngSum.split('.');
            const field = nm[0];
            const subField = nm[1];
            return scope.$watch(`record.$${field}`, function (newValue, oldValue) {
                if (newValue && scope.record) {
                    let v = 0;
                    scope.record[field].map(obj => v += parseFloat(obj[subField]));
                    if (v.toString() !== controller.$modelValue) {
                        controller.$setViewValue(v);
                        controller.$render();
                    }
                }
            });
        }
    }));
    uiKatrid.directive('ngEnter', () => (scope, element, attrs) => element.bind("keydown keypress", (event) => {
        if (event.which === 13) {
            scope.$apply(() => scope.$eval(attrs.ngEnter, { $event: event }));
            event.preventDefault();
        }
    }));
    uiKatrid.directive('ngEsc', () => (scope, element, attrs) => element.bind("keydown keypress", (event) => {
        if (event.which === 27) {
            scope.$apply(() => scope.$eval(attrs.ngEsc, { $event: event }));
            event.preventDefault();
        }
    }));
    if ($.fn.modal)
        $.fn.modal.Constructor.prototype._enforceFocus = function () { };
    uiKatrid.directive('ajaxChoices', ['$location', $location => ({
            restrict: 'A',
            require: '?ngModel',
            link(scope, element, attrs, controller) {
                const { multiple } = attrs;
                const serviceName = attrs.ajaxChoices;
                let field = attrs.field;
                let _timeout = null;
                let domain;
                const cfg = {
                    allowClear: true,
                    query(query) {
                        let data = {
                            args: [query.term],
                            kwargs: {
                                count: 1,
                                page: query.page,
                                name_fields: attrs.nameFields && attrs.nameFields.split(",") || null
                            }
                        };
                        if (domain)
                            data.domain = domain;
                        const f = () => {
                            let svc = new Katrid.Services.Model(serviceName);
                            if (field)
                                svc = svc.getFieldChoices(field, query.term, data.kwargs);
                            else
                                svc = new Katrid.Services.Model(attrs.modelChoices).searchName(data);
                            svc.then(res => {
                                let data = res.items;
                                const r = data.map(item => ({
                                    id: item[0],
                                    text: item[1]
                                }));
                                const more = query.page * Katrid.settings.services.choicesPageLimit < res.count;
                                return query.callback({
                                    results: r,
                                    more: more
                                });
                            });
                        };
                        if (_timeout)
                            clearTimeout(_timeout);
                        _timeout = setTimeout(f, 400);
                    },
                    escapeMarkup(m) {
                        return m;
                    },
                    initSelection(element, callback) {
                        const v = controller.$modelValue;
                        if (v) {
                            if (multiple) {
                                const values = [];
                                for (let i of Array.from(v)) {
                                    values.push({ id: i[0], text: i[1] });
                                }
                                return callback(values);
                            }
                            else {
                                return callback({ id: v[0], text: v[1] });
                            }
                        }
                    }
                };
                if (multiple)
                    cfg['multiple'] = true;
                const el = element.select2(cfg);
                let sel = el;
                element.on('$destroy', function () {
                    $('.select2-hidden-accessible').remove();
                    $('.select2-drop').remove();
                    return $('.select2-drop-mask').remove();
                });
                el.on('change', function (e) {
                    const v = el.select2('data');
                    controller.$setDirty();
                    if (v)
                        controller.$viewValue = v;
                    return scope.$apply();
                });
                controller.$render = () => {
                    if (controller.$viewValue)
                        return element.select2('val', controller.$viewValue);
                };
            }
        })]);
    uiKatrid.directive('inputMask', () => ({
        restrict: 'A',
        link(scope, el, attrs) {
            el.inputmask();
        }
    }));
    class Decimal {
        constructor($filter) {
            this.restrict = 'A';
            this.require = 'ngModel';
            this.$filter = $filter;
        }
        link(scope, element, attrs, controller) {
            let decimal = attrs.inputDecimal;
            let opts = {
                alias: 'numeric',
                groupSeparator: '.',
                unmaskAsNumber: true,
                radixPoint: ',',
                autoGroup: true,
                digitsOptional: false,
                placeholder: '0',
            };
            if (decimal)
                opts.digits = parseInt(decimal);
            element.inputmask(opts);
            controller.$parsers.push(value => {
                let v = element.inputmask('unmaskedvalue');
                return v;
            });
            controller.$formatters.push((v) => {
                if (_.isNumber(v))
                    v = v.toFixed(opts.digits).replace('.', ',');
                else if (_.isString(v))
                    v = v.replace('.', ',');
                return v;
            });
        }
    }
    uiKatrid.directive('inputDecimal', ['$filter', Decimal]);
    uiKatrid.filter('moment', () => function (input, format) {
        if (format) {
            return moment().format(format);
        }
        return moment(input).fromNow();
    });
    uiKatrid.directive('fileReader', () => ({
        restrict: 'A',
        require: 'ngModel',
        scope: {},
        link(scope, element, attrs, controller) {
            if (attrs.accept === 'image/*') {
                element.tag === 'INPUT';
            }
            return element.bind('change', function () {
                const reader = new FileReader();
                reader.onload = event => controller.$setViewValue(event.target.result);
                return reader.readAsDataURL(event.target.files[0]);
            });
        }
    }));
    uiKatrid.directive('dateInput', ['$filter', ($filter) => ({
            restrict: 'A',
            require: '?ngModel',
            link(scope, element, attrs, controller) {
                let setNow = () => {
                    let value;
                    if (attrs.type === 'date')
                        value = (new Date()).toISOString().split('T')[0];
                    else
                        value = moment(new Date()).format('YYYY-MM-DD HH:mm').replace(' ', 'T');
                    $(element).val(value);
                    controller.$setViewValue(value);
                    _focus = false;
                };
                let _focus = true;
                element
                    .focus(function () {
                    if (($(this).val() === ''))
                        _focus = true;
                })
                    .keypress(function (evt) {
                    if (evt.key.toLowerCase() === 'h') {
                        setNow();
                        evt.stopPropagation();
                        evt.preventDefault();
                    }
                })
                    .keydown(function (evt) {
                    if (/\d/.test(evt.key)) {
                        if (($(this).val() === '') && (_focus))
                            setNow();
                    }
                });
                controller.$formatters.push(function (value) {
                    if (value) {
                        return new Date(value);
                    }
                });
                controller.$parsers.push(function (value) {
                    if (_.isDate(value)) {
                        let v = moment.utc(value).format('YYYY-MM-DD');
                        if (controller.$modelValue)
                            v += 'T' + controller.$modelValue.split('T', 1)[1];
                        let r = moment.utc(v).format('YYYY-MM-DDTHH:mm:ss');
                        console.log('ret', value, v, r);
                        return r;
                    }
                });
            }
        })]);
    uiKatrid.directive('timeInput', () => ({
        restrict: 'A',
        require: '?ngModel',
        link(scope, el, attrs, controller) {
            el.inputmask({ regex: '([0-1]?[0-9]|2[0-4]):([0-5][0-9])', insertMode: false });
            el.on('focus', function () {
                setTimeout(() => $(this).select());
            });
            controller.$parsers.push(function (value) {
                let v = controller.$modelValue.split('T', 1)[0] + 'T' + value;
                console.log('time parser', v, value, controller.$viewValue);
                let r = moment.utc(v).format('YYYY-MM-DDTHH:mm:ss');
                if (r === 'Invalid date')
                    r = controller.$modelValue;
                return r;
            });
            controller.$render = function () {
                let v = controller.$modelValue;
                console.log('render', v);
                if (v)
                    return el.val(moment.utc(v).format('HH:mm'));
            };
        }
    }));
    uiKatrid.directive('cardDraggable', () => {
        return {
            restrict: 'A',
            link(scope, element, attrs, controller) {
                let cfg = {
                    connectWith: attrs.cardDraggable,
                    cursor: 'move',
                };
                if (!_.isUndefined(attrs.cardItem))
                    cfg['receive'] = (event, ui) => {
                        console.log('event');
                        let parent = angular.element(ui.item.parent()).scope();
                        let scope = angular.element(ui.item).scope();
                        console.log(scope);
                        console.log(parent);
                        let data = {};
                        data['id'] = scope.record.id;
                        $.extend(data, parent.group.$params[0]);
                        console.log(data);
                        parent.model.write([data])
                            .then(res => {
                            console.log('write ok', res);
                        });
                    };
                if (!_.isUndefined(attrs.cardGroup))
                    cfg['update'] = (event, ui) => {
                        let ids = [];
                        $.each(ui.item.parent().find('.card-group'), (idx, el) => {
                            ids.push($(el).data('id'));
                        });
                        let groupName = element.find('.card-group').first().data('group-name');
                        let modelName = scope.$parent.$parent.view.fields[groupName].model;
                        Katrid.Services.data.reorder(modelName, ids)
                            .done(res => {
                            console.log(res);
                        });
                    };
                console.log(cfg);
                element.sortable(cfg).disableSelection();
                $('#sortable').sortable();
            }
        };
    });
    uiKatrid.directive('uiTooltip', () => ({
        restrict: 'A',
        link: (scope, el, attrs) => {
            $(el).tooltip({
                container: 'body',
                delay: {
                    show: 200,
                    hide: 500
                }
            });
        }
    }));
    uiKatrid.setFocus = (el) => {
        let e = $(el);
        if (e.data('select2'))
            e.select2('focus');
        else
            el.focus();
    };
    uiKatrid.directive('action', ['$compile', ($compile) => ({
            restrict: 'E',
            priority: 99,
            link: (scope, el, attrs) => {
                console.log('define action', attrs.ngClick);
                let div = el.closest('div.data-form');
                let actions = div.find('.dropdown-menu-actions');
                let name = attrs.name;
                let label = el.html();
                let html = `<li><a href="javascript:void(0)">${label}</a></li>`;
                let newItem = $(html);
                newItem.click(() => {
                    if (attrs.object)
                        scope.model.rpc(attrs.object, [scope.$parent.record.id]);
                });
                actions.append(newItem);
                el.remove();
            }
        })]);
    class CardView {
        constructor() {
            this.restrict = 'E';
            this.scope = false;
        }
        controller($scope, element, attrs) {
            console.log('controller started');
            $scope.dataSource.autoLoadGrouping = true;
            $scope.cardShowAddGroupDlg = (event) => {
                $scope.cardAddGroupDlg = true;
                setTimeout(() => $(event.target).closest('.card-add-group').find('input').focus(), 10);
            };
            $scope.cardAddGroup = (event, name) => {
                let gname = $(event.target).closest('.card-add-group').data('group-name');
                let field = $scope.action.view.fields[gname];
                let svc = new Katrid.Services.Model(field.model);
                console.log('the name is', name);
                svc.createName(name)
                    .done((res) => {
                    console.log(res);
                });
            };
            $scope.cardAddItem = (event, name) => {
                if (name) {
                    let ctx = {};
                    let g = $(event.target).closest('.card-group');
                    ctx['default_' + g.data('group-name')] = g.data('sequence-id');
                    scope.model.createName(name, ctx)
                        .done((res) => {
                        if (res.ok) {
                            let id = res.result[0];
                            scope.model.getById(id)
                                .done((res) => {
                                if (res.ok) {
                                    let s = angular.element(event.target).scope();
                                    let g = s.group;
                                    s.$apply(() => {
                                        g.records.push(res.result.data[0]);
                                    });
                                }
                            });
                        }
                    });
                }
                $scope.kanbanHideAddGroupItemDlg(event);
            };
        }
    }
})();
(function () {
    class Dashboard extends Katrid.Forms.Views.ClientView {
        async render() {
            let model = new Katrid.Services.Model('ir.action.client');
            let res = await model.rpc('get_view', [this.action.info.id]);
            if (res.content) {
                return Katrid.Core.$compile(res.content)(this.action.scope);
            }
        }
    }
    class DashboardComponent extends Katrid.Forms.Widgets.Component {
        constructor($compile) {
            super();
            this.$compile = $compile;
            this.restrict = 'E';
            this.scope = false;
        }
        async link(scope, el, attrs, controller) {
            let dashboardId = attrs.dashboardId;
        }
    }
    let dataGroup = function (data, groups, total) {
        let res = [];
        let row = data[0];
        let x = [];
        let grps = {};
        let c = 0;
        for (let group of groups) {
            let g = [];
            if (c === 0)
                g.push(groups[0]);
            for (let row of data) {
                let v = row[group];
                if ((c > 0) && !(v in grps)) {
                    g = [v];
                    grps[v] = g;
                    for (let z of x)
                        g.push(0);
                }
                else if (c > 0)
                    g = grps[v];
                if (c > 0)
                    g[x.indexOf(row[groups[0]])] = row[total || 'total'] || 0;
                else if (!g.includes(v))
                    g.push(v);
            }
            if (c === 0) {
                x = g;
                grps[groups[0]] = g;
            }
            else {
            }
            c++;
        }
        res = Object.values(grps);
        console.log(res);
        return res;
    };
    class ChartComponent extends Katrid.Forms.Widgets.Component {
        constructor() {
            super();
        }
        async link(scope, el, attrs) {
            let res, chart, sql;
            let q = el.find('query');
            if (q.length) {
                q.remove();
                sql = q.text();
            }
            console.log('init chart');
            let groups;
            if (attrs.groups)
                groups = attrs.groups.split(',');
            let observe = async (url) => {
                if (sql)
                    res = await Katrid.Services.Query.executeSql(sql);
                else if (attrs.source)
                    res = scope[attrs.source];
                else {
                    res = await fetch(url).then(res => res.json());
                }
                let data = res.data;
                console.log(attrs);
                let cfg = {
                    bindto: el[0],
                    data: {},
                    color: {
                        pattern: Katrid.UI.Dashboard.colorPatterns,
                    },
                };
                let hasData = false;
                let type = el.attr('type');
                if (type)
                    cfg.data.type = type;
                if (groups) {
                    data = dataGroup(data, groups);
                    let vals = [];
                    for (let i = 1; i < data.length; i++)
                        vals.push(data[i][0]);
                    hasData = true;
                }
                else if (_.isArray(data) && data.length) {
                    let cols = Object.keys(data[0]);
                    cfg.data.columns = data.map(obj => [obj[cols[0]], obj[cols[1]]]);
                    hasData = true;
                }
                if (hasData)
                    chart = c3.generate(cfg);
            };
            if (attrs.urlParams) {
                let urlParams = attrs.urlParams;
                scope.$watch(attrs.urlParams, observe);
            }
            else if (attrs.source) {
                scope.$watch(attrs.source + '.data', observe);
            }
            else
                observe();
            attrs.$observe('url', observe);
        }
    }
    class Query extends Katrid.Forms.Widgets.Component {
        constructor() {
            super();
            this.priority = 200;
            this.scope = false;
        }
        link(scope, el, attrs) {
            let ds = new DataSource(el, scope);
            el.remove();
            return;
            if (!attrs.name)
                throw Error('Query name attribute is required!');
            let instance = scope[attrs.name] = { loading: false, data: null };
            let url = el.data('url');
            if (url) {
                console.log('find query by url', url);
                $.get(url)
                    .then(res => {
                    instance.loading = false;
                    let data = res.data.map((row) => (_.object(res.fields, row)));
                    scope.$apply(() => instance.data = data);
                });
                return;
            }
            let r;
            let sqlQuery = el.html();
            let inMemory = 'inMemory' in attrs;
            if (inMemory) {
                let dataBind = el.data('bind');
                let dataBindField = el.data('bind-field');
                if (dataBind) {
                    scope.$parent.$watch(dataBind, function (newValue, oldValue) {
                        if (_.isArray(newValue) && newValue.length && _.isObject(newValue[0]))
                            console.log(alasql(sqlQuery, [newValue]));
                    });
                }
                else if (dataBindField) {
                    let fnBind = function (newValue, oldValue) {
                        let fieldLog = scope.dataSource.$fieldLog[dataBindField];
                        if (fieldLog) {
                            let data = fieldLog.value;
                            if (_.isArray(data) && data.length && _.isObject(data[0])) {
                                instance = alasql(sqlQuery, [data]);
                            }
                        }
                    };
                    if (_.isString(dataBindField))
                        dataBindField = [dataBindField];
                    for (let field of dataBindField)
                        scope.$parent.$watch('$fieldLog.' + field + '.count', fnBind);
                }
            }
            else {
                instance.loading = true;
                if (_.isUndefined(attrs.url))
                    r = Katrid.Services.Query.read(attrs.queryId);
                else
                    r = $.get(attrs.url);
                r.then(res => {
                    instance.loading = false;
                    let data = res.data.map((row) => (_.object(res.fields, row)));
                    scope.$apply(() => instance.data = data);
                });
            }
            el.remove();
        }
    }
    Katrid.Actions.ClientAction.register('dashboard', Dashboard);
    Katrid.UI.uiKatrid.directive('dashboard', ['$compile', DashboardComponent]);
    Katrid.UI.uiKatrid.directive('chart', ChartComponent);
    Katrid.UI.uiKatrid.directive('query', Query);
    class Field {
        constructor(el) {
            this.el = el;
        }
        th() {
            let caption = this.el.attr('caption') || this.el.attr('name');
            let cls = this.el.attr('class');
            let title = this.el.attr('header-title');
            let attrs = '';
            if (!title)
                title = '';
            let headerClick = this.el.attr('on-header-click');
            if (cls)
                attrs += 'class ="' + cls + '"';
            if (headerClick)
                attrs += ' ng-click="' + headerClick + '"';
            return `<th title="${title}" ${attrs}>${caption}</th>`;
        }
        td() {
            let format = this.el.attr('format');
            if (format) {
                format = '|' + format;
                console.log('format', format);
            }
            else
                format = '';
            let title = this.el.attr('title');
            if (!title)
                title = '';
            let ngClass = this.el.attr('ng-class');
            let cls = this.el[0].className;
            let content = this.el.html();
            if (!content)
                content = `\${ record.${this.name}${format} }`;
            return `<td title='${title}' class="${cls}">${content}</td>`;
        }
        tfoot() {
            let total = this.total;
            if (total)
                total = '${grid.total("' + this.name + '")}';
            else if (this.footer)
                total = this.footer;
            else
                total = '';
            let cls = this.el[0].className;
            return `<td class="${cls}">${total}</td>`;
        }
        get name() {
            return this.el.attr('name');
        }
        get footer() {
            return this.el.attr('footer');
        }
        get total() {
            return this.el.attr('total');
        }
    }
    Katrid.UI.uiKatrid.directive('tableView', () => ({
        restrict: 'E',
        scope: false,
        template(el, attrs) {
            let fields = [];
            for (let fld of el.find('field'))
                fields.push(new Field($(fld)));
            return Katrid.app.getTemplate('dashboard.table.jinja2', { fields, el, attrs });
        }
    }));
    class DataSource {
        constructor(el, scope) {
            this.$el = el;
            this.controls = [];
            this.$counter = 0;
            this.$scope = scope;
            this.params = this.$el.data('params');
            this.name = el.attr('name');
            if (this.name)
                scope[this.name] = this;
            this.sql = this.$el.html();
            this.url = el.data('url');
            setTimeout(() => this.execute(), 100);
        }
        async execute() {
            this.$loading = true;
            try {
                let res;
                if (this.url) {
                    res = await fetch(this.url)
                        .then(res => res.json());
                }
                else if (this.sql) {
                    let params = this.params;
                    console.log(params);
                    if (!params)
                        params = this.$scope;
                    else {
                        let dataParams = params;
                        params = {};
                        for (let k of dataParams) {
                            let v = this.$scope[k];
                            console.log(k, v);
                            if (_.isDate(v))
                                console.log('param is date', v);
                            params[k] = v;
                        }
                    }
                    let sql = _.sprintf(this.sql, params);
                    res = await Katrid.Services.Query.executeSql(sql);
                }
                this.$counter++;
                this.data = res.data;
                this.$scope.$apply();
                this.onChange();
            }
            finally {
                this.$loading = false;
            }
        }
        onChange() {
            for (let control of this.controls)
                control.$render(this.data);
        }
    }
    class DashboardWidget {
        constructor(opts) {
            if (_.isString(opts.el))
                this.$el = $(opts.el);
            else
                this.$el = opts.el;
            this.$scope = opts.scope;
            this.$sourceScope = opts.sourceScope || opts.scope;
            this.$loading = false;
            this.create(opts);
            if (_.isString(this.dataSource)) {
                let ds = this.$sourceScope[this.dataSource];
                if (ds) {
                    ds.controls.push(this);
                    if (ds.$counter)
                        this.$render(ds.data);
                }
            }
        }
        create(opts) {
            this.dataSource = opts.dataSource || this.$el.data('source');
            this.caption = opts.caption || this.$el.attr('caption');
        }
        $render(data) {
        }
    }
    class Chart extends DashboardWidget {
        constructor(opts) {
            super(opts);
            this.backButton = $(`<button style="position: absolute; left: 0; top: 0;" class="btn btn-outline-secondary btn-sm back-button">${_.gettext('Back')}</button>`);
            this.backButton.hide();
            this.$el.prepend(this.backButton);
        }
        groupBy(data, group, totals) {
            if (data.length === 0)
                return [];
            let res = [];
            let firstRow = data[0];
            let sql = 'select ';
            let groups = group;
            if (_.isArray(groups))
                groups = groups.join(',');
            else if (_.isNumber(group))
                groups = Object.keys(firstRow)[group];
            sql += groups;
            if (_.isArray(totals))
                for (let total of totals)
                    sql += ',' + 'sum(' + total + ') as ' + total;
            else if (_.isString((totals)))
                sql += `,sum(${totals}) as ${totals}`;
            else if (_.isNumber(totals)) {
                totals = Object.keys(firstRow)[totals];
                sql += ',sum(' + totals + ') as ' + totals;
            }
            sql += ' from ? group by ';
            sql += groups;
            console.log(sql);
            res = alasql(sql, [data]);
            return res;
        }
        create(opts) {
            super.create(opts);
            this.x = opts.x;
            this.y = opts.y;
            this.keys = opts.keys;
            this.type = opts.type;
            this.axis = opts.axis;
            this.legend = opts.legend;
            this.onclick = opts.onclick;
            this.columns = opts.columns;
            this.grid = opts.grid;
            this.labels = opts.labels;
            this.pie = opts.pie;
            if (!this.columns && !this.keys && _.isUndefined(this.x) && _.isUndefined(this.y)) {
                this.x = 0;
                this.y = 1;
            }
        }
        $render(data) {
            this.$data = data;
            if (this.columns)
                this.$columns = this.columns;
            else
                this.$columns = this.groupBy(data, this.x, this.y).map(obj => Object.values(obj));
            let size = {
                width: this.$el.parent().width(),
            };
            this.$chart = c3.generate({
                bindto: this.$el[0],
                data: {
                    columns: this.$columns,
                    type: this.type,
                    onclick: this.onclick,
                    labels: this.labels,
                },
                color: {
                    pattern: ['#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5']
                },
                pie: this.pie,
                size,
                grid: this.grid,
                legend: this.legend,
                axis: this.axis,
            });
            this.$chart.$chart = this;
        }
        query(sql, params) {
            return alasql(sql, params);
        }
    }
    class GridView extends DashboardWidget {
        constructor(opts) {
            super(opts);
            this._groupBy = [];
            let groupBy = this.$el.attr('group-by');
            if (groupBy)
                this._groupBy = groupBy.split(',');
            this.totals = [];
            this.fields = [];
            for (let fld of this.$el.find('field')) {
                let field = new Field($(fld));
                this.fields.push(field);
                if (field.total)
                    this.totals.push(field.name);
            }
            this.$scope.grid = this;
            let templ = Katrid.app.getTemplate('dashboard.grid.jinja2', {
                self: this,
                fields: this.fields,
            });
            templ = Katrid.Core.$compile(templ)(this.$scope);
            this.$el.html(templ);
        }
        get groupBy() {
            return this._groupBy;
        }
        set groupBy(groupBy) {
            this._groupBy = groupBy;
            if (this._lastData)
                this.$render(this._lastData);
        }
        total(attr) {
            console.log('calc attr', attr);
            let r = 0;
            if (this._lastData)
                for (let row of this._lastData)
                    r += row[attr];
            return r;
        }
        $render(data) {
            this._lastData = data;
            if (!data)
                data = [];
            if (this.groupBy.length) {
                data = groupBy(data, this.groupBy, this.totals, this.fields[0].name);
            }
            this.$scope.records = this._renderGroup(data);
        }
        _renderGroup(data) {
            let r = [];
            for (let row of data) {
                r.push(row);
                if (row.$group)
                    r = r.concat(this._renderGroup(row.$children));
            }
            return r;
        }
    }
    function groupBy(data, member, totals, to) {
        let r = {};
        for (let row of data) {
            let v = row[member];
            let group = r[v];
            if (!group) {
                group = r[v] = { $children: [] };
                for (let total of totals)
                    group[total] = 0;
            }
            group.$children.push(row);
            group.$group = true;
            group[to] = v;
            for (let total of totals)
                group[total] += row[total];
        }
        return Object.values(r);
    }
    class GridRow {
        constructor(grid, row, el) {
            this.row = row;
        }
    }
    class GroupRow extends GridRow {
    }
    Katrid.UI.uiKatrid.directive('gridView', () => ({
        restrict: 'E',
        scope: {},
        async link(scope, el, attrs) {
            let grid = new GridView({ el, attrs, scope, sourceScope: scope.$parent });
            return;
            scope.loading = false;
            let res, sql;
            let query = el.find('query');
            if (attrs.source) {
                console.log('data source is', attrs.source);
            }
            else if (query.length) {
                sql = query.text();
                query.remove();
                if (sql) {
                    scope.loading = true;
                    scope.$apply();
                    res = await Katrid.Services.Query.executeSql(sql);
                    scope.loading = false;
                }
                if (res) {
                    scope.records = res.data;
                    scope.$apply();
                }
            }
        }
    }));
    Katrid.UI.uiKatrid.filter('duration', () => {
        return (input, unit, format) => {
            if (!format)
                format = 'HH:mm:ss';
            if (input) {
                if ((unit === 'seconds') && (_.isString(input)))
                    input = parseInt(input);
                let fmt = moment.duration(input, unit).format(format);
                if (fmt.length === 5)
                    fmt = '00:' + fmt;
                return fmt;
            }
            return input;
        };
    });
    Katrid.UI.Dashboard = {
        Chart,
        colorPatterns: [
            '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
            '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'
        ],
    };
})();
(function () {
    let uiKatrid = Katrid.UI.uiKatrid;
    uiKatrid.directive('datePicker', ['$filter', $filter => ({
            restrict: 'A',
            require: '?ngModel',
            link(scope, el, attrs, controller) {
                let mask = '99/99/9999';
                let format = attrs.datePicker || 'L';
                if (format === 'L LT')
                    mask = '99/99/9999 99:99';
                el.inputmask({
                    mask,
                    insertMode: false,
                });
                let calendar = $(el.parent()).datetimepicker({
                    useCurrent: false,
                    format,
                    icons: {
                        time: 'fa fa-clock',
                    },
                })
                    .on('dp.change', function (evt) {
                    calendar.datetimepicker('hide');
                })
                    .on('dp.hide', function (evt) {
                    controller.$setDirty();
                    controller.$setViewValue(el.val());
                });
                el.on('focus', () => el.select());
                controller.$render = function () {
                    if (controller.$modelValue) {
                        calendar.datetimepicker('date', moment.utc(controller.$modelValue));
                    }
                    else
                        el.val('');
                };
                el.on('blur', () => {
                    let v = moment(el.val(), format);
                    if (v.isValid())
                        controller.$modelValue = v.format('YYYY-MM-DD');
                    else
                        controller.$modelValue = null;
                });
                controller.$parsers.push(value => {
                    let v = moment(el.val(), format);
                    if (v.isValid()) {
                        if (format === 'L')
                            return v.format('YYYY-MM-DD');
                        else if (format === 'L LT')
                            return v.format('YYYY-MM-DD HH:mm');
                    }
                    return null;
                });
            }
        })]);
    uiKatrid.directive('timePicker', ['$filter', $filter => ({
            restrict: 'A',
            require: '?ngModel',
            link(scope, el, attrs, controller) {
                let mask = '99:99';
                el.inputmask({
                    mask,
                    insertMode: false,
                });
                el.on('focus', () => el.select());
            }
        })]);
})();
(function () {
    const DEFAULT_PAGE_SIZE = 12;
    class Component {
        constructor(el, config) {
            this.config = config;
            this.create();
            this.render();
            this.$el = $(el);
        }
        create() {
        }
        render() {
        }
    }
    Katrid.UI.uiKatrid.directive("fkAutocomplete", ['$controller', ($controller) => ({
            restrict: "A",
            require: "ngModel",
            link(scope, el, attrs, controller) {
                let fieldName = attrs.field;
                let modelName = attrs.modelName;
                let field;
                if (!fieldName) {
                    field = scope.view.fields[attrs.name];
                    if (!field)
                        field = scope.action.fields[attrs.name];
                }
                $(el).autocomplete({
                    source: (req, res) => {
                        let domain;
                        if (field && field.domain) {
                            domain = field.domain;
                            if (_.isString(domain))
                                domain = scope.$eval(domain);
                        }
                        let data = {
                            args: [req.term],
                            kwargs: {
                                domain: domain,
                                limit: DEFAULT_PAGE_SIZE,
                                name_fields: attrs.nameFields && attrs.nameFields.split(",") || null
                            }
                        };
                        let svc;
                        if (fieldName)
                            svc = new Katrid.Services.Model(modelName).getFieldChoices(fieldName, req.term, data.kwargs);
                        else if (scope.model)
                            svc = scope.model.getFieldChoices(field.name, req.term, data.kwargs);
                        else
                            svc = new Katrid.Services.Model(field.model).searchName(data);
                        svc.then(r => {
                            let items = [];
                            for (let obj of r.items)
                                items.push({ value: obj[0], label: obj[1] });
                            res(items);
                        });
                    },
                    minLength: 1,
                    select: (event, ui) => {
                        event.preventDefault();
                        event.stopPropagation();
                        el.val(ui.item.label);
                        scope.$apply(() => {
                            let obj = [ui.item.value, ui.item.label];
                            el.data('value', obj);
                            controller.$setViewValue(obj);
                            controller.$setDirty();
                            return false;
                        });
                        return false;
                    }
                });
                controller.$parsers.push(value => {
                    value = el.data('value');
                    return value;
                });
                controller.$formatters.push(value => {
                    if (_.isArray(value))
                        return value[1];
                    return value;
                });
            }
        })]);
    Katrid.UI.uiKatrid.directive("foreignkey", ['$compile', '$controller', ($compile, $controller) => ({
            restrict: "A",
            require: "ngModel",
            link(scope, el, attrs, controller) {
                let serviceName;
                let sel = el;
                let _shown = false;
                const field = scope.view.fields[attrs.name];
                el.addClass("form-field");
                if (attrs.serviceName)
                    serviceName = attrs;
                else if (scope.action && scope.action.model)
                    serviceName = scope.action.model.name;
                else
                    serviceName = attrs.foreignkey;
                const newItem = function () {
                };
                const newEditItem = function () {
                };
                let _timeout = null;
                let config = {
                    allowClear: true,
                    query(query) {
                        let domain = field.domain;
                        if (domain && _.isString(domain))
                            domain = scope.$eval(domain);
                        let data = {
                            args: [query.term],
                            kwargs: {
                                count: 1,
                                page: query.page,
                                domain: domain,
                                name_fields: attrs.nameFields && attrs.nameFields.split(",") || null
                            }
                        };
                        const f = () => {
                            let svc;
                            if (scope.model)
                                svc = scope.model.getFieldChoices(field.name, query.term, data.kwargs);
                            else
                                svc = new Katrid.Services.Model(field.model).searchName(data);
                            svc.then(res => {
                                let data = res.items;
                                const r = data.map(item => ({
                                    id: item[0],
                                    text: item[1]
                                }));
                                const more = query.page * Katrid.settings.services.choicesPageLimit < res.count;
                                if (!multiple && !more) {
                                    let msg;
                                    const v = sel.data("select2").search.val();
                                    if ((attrs.allowCreate && attrs.allowCreate !== "false" || attrs.allowCreate == null) && v) {
                                        msg = Katrid.i18n.gettext('Create <i>"%s"</i>...');
                                        r.push({
                                            id: newItem,
                                            text: msg
                                        });
                                    }
                                }
                                return query.callback({
                                    results: r,
                                    more: more
                                });
                            });
                        };
                        if (_timeout)
                            clearTimeout(_timeout);
                        _timeout = setTimeout(f, 400);
                    },
                    ajax: {
                        url: `/api/rpc/${serviceName}/get_field_choices/`,
                        contentType: "application/json",
                        dataType: "json",
                        type: "POST"
                    },
                    formatSelection(val) {
                        if (val.id === newItem || val.id === newEditItem)
                            return Katrid.i18n.gettext("Creating...");
                        return val.text;
                    },
                    formatResult(state) {
                        const s = sel.data("select2").search.val();
                        if (state.id === newItem) {
                            state.str = s;
                            return `<strong>${sprintf(state.text, s)}</strong>`;
                        }
                        else if (state.id === newEditItem) {
                            state.str = s;
                            return `<strong>${sprintf(state.text, s)}</strong>`;
                        }
                        return state.text;
                    },
                    initSelection(el, cb) {
                        let v = controller.$modelValue;
                        if (multiple) {
                            v = v.map(obj => ({
                                id: obj[0],
                                text: obj[1]
                            }));
                            return cb(v);
                        }
                        else if (_.isArray(v)) {
                            return cb({
                                id: v[0],
                                text: v[1]
                            });
                        }
                    }
                };
                let allowCreateEdit = attrs.noCreateEdit;
                allowCreateEdit = _.isUndefined(allowCreateEdit) || !Boolean(allowCreateEdit);
                let { multiple: multiple } = attrs;
                if (multiple) {
                    config["multiple"] = true;
                }
                sel = sel.select2(config);
                let createNew = () => {
                    sel.select2('close');
                    let service = new Katrid.Services.Model(field.info.model);
                    return service.getViewInfo({
                        view_type: "form"
                    }).then(function (res) {
                        let title = _.sprintf(Katrid.i18n.gettext('Create: %(title)s'), { title: field.caption });
                        let options = {
                            scope: scope.$new(true),
                            $controller: $controller,
                            sel: sel, field: field,
                            title: title,
                            view: res,
                            model: service,
                            caption: field.caption,
                        };
                        let wnd = new Katrid.Forms.Dialogs.Window(options);
                        wnd.createNew();
                    });
                };
                if (allowCreateEdit)
                    sel.parent().find('div.select2-container>div.select2-drop')
                        .append(`<div style="padding: 4px;"><button type="button" class="btn btn-link btn-sm">${Katrid.i18n.gettext('Create New...')}</button></div>`)
                        .find('button').click(createNew);
                sel.on("change", async (e) => {
                    let v = e.added;
                    if (v && v.id === newItem) {
                        let service = new Katrid.Services.Model(field.model);
                        try {
                            let res = await service.createName(v.str);
                            let vals = {};
                            vals[field.name] = res;
                            scope.dataSource.setValues(vals);
                            sel.select2('data', { id: res[0], text: res[1] });
                        }
                        catch (err) {
                            let res = await service.getViewInfo({
                                view_type: "form"
                            });
                            let title = _.sprintf(Katrid.i18n.gettext('Create: %(title)s'), { title: field.caption });
                            let options = {
                                scope: scope.$new(true),
                                $controller: $controller,
                                sel: sel, field: field,
                                title: title,
                                view: res,
                                model: service,
                                action: scope.action,
                            };
                            let wnd = new Katrid.Forms.Dialogs.Window(options);
                            wnd.createNew({ creationName: v.str });
                            sel.select2('data', null);
                        }
                    }
                    else if (v && v.id === newEditItem) {
                    }
                    else if (multiple && e.val.length) {
                        return controller.$setViewValue(e.val);
                    }
                    else {
                        controller.$setDirty();
                        if (v) {
                            return controller.$setViewValue([v.id, v.text]);
                        }
                        else {
                            return controller.$setViewValue(null);
                        }
                    }
                }).on("select2-open", () => {
                    if (!_shown) {
                        _shown = true;
                        let parentModal = el.closest("div.modal");
                        if (parentModal.length)
                            parentModal.on("hide.bs.modal", () => sel.select2("destroy"));
                    }
                });
                controller.$parsers.push(value => {
                    if (value) {
                        if (_.isArray(value))
                            return value;
                        else if (_.isObject(value))
                            return [value.id, value.text];
                        else
                            return value;
                    }
                    return null;
                });
                if (!multiple)
                    scope.$watch(attrs.ngModel, (newValue, oldValue) => sel.select2("val", newValue));
                return controller.$render = function () {
                    if (multiple) {
                        if (controller.$modelValue) {
                            const v = Array.from(controller.$modelValue).map(obj => obj[0]);
                            sel.select2("val", controller.$modelValue);
                        }
                    }
                    else if (controller.$viewValue) {
                        return sel.select2("val", controller.$viewValue[0]);
                    }
                    else {
                        return sel.select2("val", null);
                    }
                };
            }
        })]);
    Katrid.UI.uiKatrid.filter('m2m', () => function (input) {
        if (_.isArray(input))
            return input.map((obj) => obj ? obj[1] : null).join(', ');
    });
})();
(function () {
    Katrid.UI.uiKatrid.directive('sortableField', ['$compile', '$timeout', ($compile, $timeout) => ({
            restrict: 'E',
            require: 'ngModel',
            replace: true,
            scope: {},
            link: {
                post: function (scope, el, attrs) {
                    let tbl = el.closest('tbody');
                    let fixHelperModified = function (e, tr) {
                        let $originals = tr.children();
                        let $helper = tr.clone();
                        $helper.children().each(function (index) {
                            $(this).width($originals.eq(index).width());
                        });
                        return $helper;
                    }, updateIndex = function (e, ui) {
                        $('td.list-column-sortable', ui.item.parent()).each(function (i) {
                        });
                    };
                    tbl.sortable({
                        helper: fixHelperModified,
                        stop: updateIndex
                    }).disableSelection();
                }
            },
            template(element, attrs) {
                return sprintf(Katrid.$templateCache.get('view.field.SortableField'), { fieldName: attrs.name });
            }
        })
    ]);
})();
(function () {
    Katrid.UI.uiKatrid.directive('statusField', ['$compile', ($compile) => ({
            restrict: 'A',
            priority: 1,
            replace: true,
            link(scope, element, attrs, controller) {
                const field = scope.view.fields[attrs.name];
                scope.choices = field.choices;
                if (!attrs.readonly) {
                    scope.itemClick = () => console.log('status field item click');
                }
                element.closest('header').prepend(element);
            },
            template(element, attrs) {
                return sprintf(Katrid.app.$templateCache.get('view.field.StatusField'), { fieldName: attrs.name });
            }
        })
    ]);
})();
(function () {
    Katrid.UI.uiKatrid.filter('numberFormat', () => {
        return (value, maxDigits = 3) => {
            if (value == null)
                return '';
            return new Intl.NumberFormat('pt-br', { maximumSignificantDigits: maxDigits }).format(value);
        };
    });
})();
(function () {
    class Grid {
        constructor($compile) {
            this.restrict = 'E';
            this.scope = {};
            this.$compile = $compile;
        }
        async loadViews(scope, element, views, attrs) {
            let res = await scope.model.loadViews();
            let fld = res.views.list.fields[scope.field.field];
            scope.dataSource.field = scope.field;
            if (fld)
                fld.visible = false;
            let newViews = res.views;
            for (let [k, v] of Object.entries(views))
                newViews[k].content = v;
            scope.views = newViews;
            scope.view = newViews.list;
            let content = $(scope.view.content);
            if (scope.inline)
                content.attr('ng-row-click', 'editItem($event, $index)').attr('inline-editor', scope.inline);
            else
                content.attr('ng-row-click', 'openItem($event, $index)');
            content.attr('records', 'records');
            content.attr('list-options', '{"deleteRow": true}');
            let el = (this.$compile(content)(scope));
            element.html(el);
            element.prepend(this.$compile(Katrid.app.getTemplate('view.form.grid.toolbar.jinja2', { attrs }))(scope));
            element.find('table').addClass('table-bordered grid');
        }
        async showDialog(scope, attrs, index) {
            if (scope.views.form)
                await this.renderDialog(scope, attrs);
            if (index != null) {
                scope.recordIndex = index;
                let record = scope.records[index];
                if (record && record.$loaded)
                    scope.record = record;
                else if (record) {
                    let res = await scope.dataSource.get(scope.records[index].id, 0, false, index);
                    res.$loaded = true;
                }
            }
        }
        ;
        async link(scope, element, attrs) {
            if (attrs.ngDefaultValues)
                scope.ngDefaultValues = attrs.ngDefaultValues;
            let me = this;
            const field = scope.$parent.view.fields[attrs.name];
            scope.totalDisplayed = 1000;
            scope.fieldName = attrs.name;
            scope.field = field;
            scope.records = [];
            scope.recordIndex = -1;
            scope._cachedViews = {};
            scope._ = scope.$parent._;
            scope._changeCount = 0;
            scope.dataSet = [];
            scope.model = new Katrid.Services.Model(field.model);
            scope.isList = true;
            if (attrs.inlineEditor === 'tabular')
                scope.inline = 'tabular';
            else if (attrs.hasOwnProperty('inlineEditor'))
                scope.inline = 'inline';
            scope.getContext = function () {
                return {};
            };
            scope.$setDirty = function () {
                return {};
            };
            let dataSource = scope.dataSource = new Katrid.Data.DataSource(scope);
            dataSource.readonly = !_.isUndefined(attrs.readonly);
            let p = scope.$parent;
            while (p) {
                if (p.action && p.action.dataSource) {
                    scope.dataSource.masterSource = p.action.dataSource;
                    break;
                }
                else if (p.dataSource) {
                    scope.dataSource.masterSource = p.dataSource;
                    break;
                }
                p = p.$parent;
            }
            scope.parent = dataSource.masterSource.scope;
            scope.action = dataSource.masterSource.action;
            dataSource.action = scope.action;
            scope.dataSource.fieldName = scope.fieldName;
            scope.gridDialog = null;
            let gridEl = null;
            let views = {};
            for (let child of element.children()) {
                if (child.tagName.startsWith('GRID:')) {
                    let viewType = child.tagName.split(':')[1].toLowerCase();
                    child = $(child);
                    views[viewType] = `<${viewType}>${child.html()}</${viewType}>`;
                }
            }
            await me.loadViews(scope, element, views, attrs);
            scope.doViewAction = (viewAction, target, confirmation) => scope.action._doViewAction(scope, viewAction, target, confirmation);
            let _cacheChildren = (fieldName, record, records) => {
                record[fieldName] = records;
            };
            scope._incChanges = () => {
                if (!scope.$parent.$fieldLog[scope.field.name])
                    scope.$parent.$fieldLog[scope.field.name] = {};
                scope.$parent.$fieldLog[scope.field.name].count++;
            };
            scope.addItem = async () => {
                await scope.dataSource.insert();
                if (attrs.$attr.inlineEditor) {
                    scope.records.splice(0, 0, scope.record);
                    scope.dataSource.edit();
                    if (!scope.$parent.record[scope.fieldName])
                        scope.$parent.record[scope.fieldName] = [];
                    scope.$parent.record[scope.fieldName].push(scope.record);
                    scope.$apply();
                }
                else
                    return this.showDialog(scope, attrs);
            };
            scope.addRecord = function (rec) {
                let record = Katrid.Data.createRecord({ $loaded: true }, scope.dataSource);
                for (let [k, v] of Object.entries(rec))
                    record[k] = v;
                scope.records.push(record);
                if (!scope.dataSource.parent.record[scope.fieldName])
                    scope.dataSource.parent.record[scope.fieldName] = [];
                scope.dataSource.parent.record[scope.fieldName].push(record);
                console.log('add record', record);
            };
            scope.cancelChanges = () => scope.dataSource.setState(Katrid.Data.DataSourceState.browsing);
            scope.openItem = async (evt, index) => {
                await this.showDialog(scope, attrs, index);
                if (scope.dataSource.masterSource.changing && !scope.dataSource.readonly) {
                    scope.dataSource.edit();
                }
                scope.$apply();
            };
            scope.editItem = (evt, index) => {
                if (scope.dataSource.changing)
                    scope.save();
                if (scope.$parent.dataSource.changing) {
                    scope.dataSource.recordIndex = index;
                    scope.dataSource.edit();
                    setTimeout(() => {
                        let el = $(evt.target).closest('td').find('input.form-control').focus();
                        setTimeout(() => el.select());
                    }, 100);
                }
            };
            scope.removeItem = function (idx) {
                const rec = scope.records[idx];
                scope.records.splice(idx, 1);
                scope._incChanges();
                rec.$record.$delete();
            };
            scope.$set = (field, value) => {
                const control = scope.form[field];
                control.$setViewValue(value);
                control.$render();
            };
            scope.save = function () {
                scope._incChanges();
                if (scope.inline)
                    return;
                if (scope.recordIndex > -1) {
                    let rec = scope.record;
                    scope.record = null;
                    scope.records.splice(scope.recordIndex, 1);
                    setTimeout(() => {
                        scope.records.splice(scope.recordIndex, 0, rec);
                        scope.$apply();
                    });
                }
                else if (scope.recordIndex === -1) {
                    scope.records.push(scope.record);
                }
                if (!scope.inline) {
                    scope.gridDialog.modal('toggle');
                }
            };
            let _loadChildFromCache = (child) => {
                if (scope.record.hasOwnProperty(child.fieldName)) {
                    child.scope.records = scope.record[child.fieldName];
                }
            };
            function trim(str) {
                str = str.replace(/^\s+/, '');
                for (let i = str.length - 1; i >= 0; i--) {
                    if (/\S/.test(str.charAt(i))) {
                        str = str.substring(0, i + 1);
                        break;
                    }
                }
                return str;
            }
            scope.pasteData = async function () {
                let cache = {};
                let _queryForeignKeyField = async function (field, val) {
                    return new Promise(async (resolve, reject) => {
                        if (!cache[field.name])
                            cache[field.name] = {};
                        if (cache[field.name][val] === undefined) {
                            let res = await scope.model.getFieldChoices(field.name, val, { exact: true });
                            if (res.items && res.items.length)
                                cache[field.name][val] = res.items[0];
                            else
                                cache[field.name][val] = null;
                        }
                        resolve(cache[field.name][val]);
                    });
                };
                let fields = [];
                for (let f of $(scope.view.content).find('field')) {
                    let field = scope.view.fields[$(f).attr('name')];
                    if (field && (_.isUndefined(field.visible) || field.visible))
                        fields.push(field);
                }
                let txt = await navigator.clipboard.readText();
                let rowNo = 0;
                for (let row of txt.split(/\r?\n/)) {
                    rowNo++;
                    if (row) {
                        let i = 0;
                        let newObj = {};
                        for (let col of row.split(/\t/)) {
                            let field = fields[i];
                            if (field instanceof Katrid.Data.Fields.ForeignKey)
                                newObj[field.name] = await _queryForeignKeyField(field, trim(col));
                            else
                                newObj[field.name] = trim(col);
                            i++;
                        }
                        scope.addRecord(newObj);
                    }
                }
                scope.$apply();
            };
            let masterChanged = function (evt, master, key) {
                if (master === scope.dataSource.masterSource) {
                    scope.dataSet = [];
                    scope._changeCount = 0;
                    scope.records = [];
                    if (key != null) {
                        const data = {};
                        data[field.field] = key;
                        if (key) {
                            scope.dataSource.pageLimit = 1000;
                            return scope.dataSource.search(data)
                                .then((data) => {
                                scope.$parent.$fieldLog[field.name] = { count: 0, value: data.data };
                                scope.$parent.record[field.name] = data.data;
                                scope.$apply();
                            })
                                .finally(() => scope.dataSource.state = Katrid.Data.DataSourceState.browsing);
                        }
                    }
                    else {
                        scope.$parent.record[field.name] = [];
                    }
                }
            };
            if (scope.dataSource.pendingMasterId)
                masterChanged(null, scope.dataSource.parent, scope.dataSource.pendingMasterId);
            let unhook = [
                scope.$on('masterChanged', masterChanged),
                scope.$on('afterCancel', function (evt, master) {
                    if (master === scope.dataSource.masterSource)
                        scope.dataSource.cancel();
                })
            ];
            scope.$on('$destroy', function () {
                unhook.map(fn => fn());
            });
        }
        async renderDialog(scope, attrs) {
            let el;
            let html = scope.views.form.content;
            scope.view = scope.views.form;
            let fld = scope.views.form.fields[scope.field.field];
            if (fld)
                fld.visible = false;
            if (attrs.inline) {
                el = me.$compile(html)(scope);
                gridEl.find('.inline-input-dialog').append(el);
            }
            else {
                let view = new Katrid.UI.Views.FormView({ scope }, scope.views.form, {
                    dialog: true,
                    templateUrl: 'view.field.OneToManyField.Dialog.jinja2',
                    context: {
                        field: scope.field,
                    },
                });
                el = view.render();
            }
            scope.formElement = el.find('form:first');
            scope.form = scope.formElement.controller('form');
            scope.gridDialog = el;
            if (!attrs.inline) {
                el.modal('show');
                el.on('hidden.bs.modal', function () {
                    scope.record = null;
                    scope.dataSource.state = Katrid.Data.DataSourceState.browsing;
                    el.remove();
                    scope.gridDialog = null;
                    scope.recordIndex = -1;
                    _destroyChildren();
                });
            }
            el.find('.modal-dialog').addClass('ng-form');
            return new Promise(function (resolve) {
                el.on('shown.bs.modal', () => resolve(el));
            });
        }
        ;
    }
    Katrid.UI.uiKatrid
        .directive('grid', ['$compile', Grid])
        .directive('list', ['$compile', $compile => ({
            restrict: 'E',
            scope: false,
            compile(el, attrs) {
                el.addClass('table-responsive');
                let rowClick = attrs.ngRowClick;
                let records = attrs.records || 'records';
                let content = el.html();
                let options = {};
                if (attrs.listOptions)
                    options = JSON.parse(attrs.listOptions);
                let template = Katrid.app.getTemplate('view.list.table.jinja2', { attrs, rowClick, options, records });
                return function (scope, el, attrs, controller) {
                    let templ = $(template);
                    let tr = templ.find('tbody>tr:first');
                    let thead = templ.find('thead>tr:first');
                    let tfoot = templ.find('tfoot>tr:first');
                    let formView;
                    let ngTrClass = attrs.ngTrClass;
                    if (ngTrClass)
                        ngTrClass = ',' + ngTrClass;
                    else
                        ngTrClass = '';
                    console.log('row class', ngTrClass);
                    if (attrs.inlineEditor) {
                        templ.addClass('inline-editor');
                        formView = $(scope.views.form.content);
                        tr
                            .attr('ng-form', "grid-row-form-{{$index}}")
                            .attr('id', 'grid-row-form-{{$index}}');
                    }
                    else
                        tr.attr('ng-class', "{" +
                            "'group-header': record.$hasChildren, " +
                            "'form-data-changing': (dataSource.changing && dataSource.recordIndex === $index), " +
                            "'form-data-readonly': !(dataSource.changing && dataSource.recordIndex === $index)" +
                            ngTrClass +
                            "}");
                    let fields = $('<div>').append(content);
                    let totals = [];
                    let hasTotal = false;
                    let td, th;
                    for (let fld of fields.children('field')) {
                        let fieldName = fld.getAttribute('name');
                        let field = scope.view.fields[fieldName];
                        if (field) {
                            field.assign(scope.action.view, fld);
                            let total = fld.getAttribute('total');
                            if (total) {
                                hasTotal = true;
                                totals.push({
                                    field: field,
                                    name: fieldName,
                                    total: total,
                                });
                            }
                            else
                                totals.push(false);
                            if (!field.visible)
                                continue;
                            let inplaceEditor = false;
                            if (formView) {
                                inplaceEditor = formView.find(`field[name="${fieldName}"]`);
                                inplaceEditor = $(inplaceEditor[0].outerHTML).attr('form-field', 'form-field').attr('inline-editor', attrs.inlineEditor)[0].outerHTML;
                            }
                            let fieldEl = $(field.render('list', fld, { view: scope.view }));
                            th = fieldEl.first();
                            td = $(th).next();
                        }
                        else {
                            th = '<th></th>';
                            td = `<td>${fld.innerHTML}</td>`;
                        }
                        tr.append(td);
                        thead.append(th);
                    }
                    if (hasTotal)
                        for (total of totals)
                            tfoot.append(Katrid.app.getTemplate('view.list.table.total.jinja2', { field: total.field }));
                    else
                        tfoot.remove();
                    if (options.deleteRow) {
                        let delRow = $(Katrid.app.getTemplate('view.list.table.delete.jinja2'));
                        for (let child of delRow)
                            if (child.tagName === 'TD')
                                tr.append(child);
                            else if (child.tagName === 'TH')
                                thead.append(child);
                        if (hasTotal)
                            tfoot.append('<td class="list-column-delete" ng-show="dataSource.parent.changing && !dataSource.readonly"></td>');
                    }
                    el.html('');
                    el.append($compile(templ)(scope));
                };
            }
        })]);
})();
(function () {
    class Total {
        constructor($filter) {
            this.restrict = 'E';
            this.scope = false;
            this.replace = true;
            this.$filter = $filter;
        }
        template(el, attrs) {
            if (attrs.expr[0] === "'")
                return `<span>${attrs.expr.substring(1, attrs.expr.length - 1)}</span>`;
            else
                return `<span ng-bind="total$${attrs.field}|number:2"></span>`;
        }
        link(scope, element, attrs, controller) {
            if (attrs.expr[0] !== "'")
                scope.$watch(`records`, (newValue) => {
                    let total = 0;
                    newValue.map((r) => total += parseFloat(r[attrs.field]));
                    scope['total$' + attrs.field] = total;
                    scope.parent['total$' + scope.fieldName + '$' + attrs.field] = total;
                });
        }
    }
    Katrid.UI.uiKatrid.directive('ngTotal', ['$filter', Total]);
})();
(function ($) {
    "use strict";
    function setSelectionRange(rangeStart, rangeEnd) {
        if (this.createTextRange) {
            var range = this.createTextRange();
            range.collapse(true);
            range.moveStart('character', rangeStart);
            range.moveEnd('character', rangeEnd - rangeStart);
            range.select();
        }
        else if (this.setSelectionRange) {
            this.focus();
            this.setSelectionRange(rangeStart, rangeEnd);
        }
    }
    function getSelection(part) {
        var pos = this.value.length;
        part = (part.toLowerCase() == 'start' ? 'Start' : 'End');
        if (document.selection) {
            var range = document.selection.createRange(), stored_range, selectionStart, selectionEnd;
            stored_range = range.duplicate();
            stored_range.expand('textedit');
            stored_range.setEndPoint('EndToEnd', range);
            selectionStart = stored_range.text.length - range.text.length;
            selectionEnd = selectionStart + range.text.length;
            return part == 'Start' ? selectionStart : selectionEnd;
        }
        else if (typeof (this['selection' + part]) != "undefined") {
            pos = this['selection' + part];
        }
        return pos;
    }
    var _keydown = {
        codes: {
            188: 44,
            110: 44,
            108: 44,
            109: 45,
            190: 46,
            191: 47,
            192: 96,
            220: 92,
            222: 39,
            221: 93,
            219: 91,
            173: 45,
            187: 61,
            186: 59,
            189: 45,
        },
        shifts: {
            96: "~",
            49: "!",
            50: "@",
            51: "#",
            52: "$",
            53: "%",
            54: "^",
            55: "&",
            56: "*",
            57: "(",
            48: ")",
            45: "_",
            61: "+",
            91: "{",
            93: "}",
            92: "|",
            59: ":",
            39: "\"",
            44: "<",
            46: ">",
            47: "?"
        }
    };
    $.fn.number = function (number, decimals, dec_point, thousands_sep) {
        thousands_sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep;
        dec_point = (typeof dec_point === 'undefined') ? '.' : dec_point;
        decimals = (typeof decimals === 'undefined') ? 0 : decimals;
        var u_dec = ('\\u' + ('0000' + (dec_point.charCodeAt(0).toString(16))).slice(-4)), regex_dec_num = new RegExp('[^-' + u_dec + '0-9]', 'g'), regex_dec = new RegExp(u_dec, 'g');
        if (number === true) {
            if (this.is('input:text')) {
                return this.on({
                    'keydown.format': function (e) {
                        var $this = $(this), data = $this.data('numFormat'), code = (e.keyCode ? e.keyCode : e.which), chara = '', start = getSelection.apply(this, ['start']), end = getSelection.apply(this, ['end']), val = '', setPos = false;
                        if (e.key === '-') {
                            if ($this.val() === 0)
                                data.negative = true;
                            else {
                                data.negative = false;
                                if (this.value.includes('-'))
                                    this.value = this.value.substr(1, this.value.length - 1);
                                else
                                    this.value = '-' + this.value;
                            }
                            $this.val(this.value);
                            e.preventDefault();
                            return;
                        }
                        if (_keydown.codes.hasOwnProperty(code)) {
                            code = _keydown.codes[code];
                        }
                        if (!e.shiftKey && (code >= 65 && code <= 90)) {
                            code += 32;
                        }
                        else if (!e.shiftKey && (code >= 69 && code <= 105)) {
                            code -= 48;
                        }
                        else if (e.shiftKey && _keydown.shifts.hasOwnProperty(code)) {
                            chara = _keydown.shifts[code];
                        }
                        if (chara == '')
                            chara = String.fromCharCode(code);
                        if (code !== 8 && chara != dec_point && !chara.match(/[0-9]/)) {
                            var key = (e.keyCode ? e.keyCode : e.which);
                            if (key == 46 || key == 8 || key == 9 || key == 27 || key == 13 ||
                                ((key == 65 || key == 82) && (e.ctrlKey || e.metaKey) === true) ||
                                ((key == 86 || key == 67) && (e.ctrlKey || e.metaKey) === true) ||
                                ((key >= 35 && key <= 39))) {
                                return;
                            }
                            e.preventDefault();
                            return false;
                        }
                        if (start == 0 && end == this.value.length || $this.val() == 0) {
                            if (code === 8) {
                                start = end = 1;
                                this.value = '';
                                data.init = (decimals > 0 ? -1 : 0);
                                data.c = (decimals > 0 ? -(decimals + 1) : 0);
                                setSelectionRange.apply(this, [0, 0]);
                            }
                            else if (chara === dec_point) {
                                start = end = 1;
                                this.value = '0' + dec_point + (new Array(decimals + 1).join('0'));
                                data.init = (decimals > 0 ? 1 : 0);
                                data.c = (decimals > 0 ? -(decimals + 1) : 0);
                            }
                            else if (this.value.length === 0) {
                                data.init = (decimals > 0 ? -1 : 0);
                                data.c = (decimals > 0 ? -(decimals) : 0);
                            }
                        }
                        else {
                            data.c = end - this.value.length;
                        }
                        if (decimals > 0 && chara == dec_point && start == this.value.length - decimals - 1) {
                            data.c++;
                            data.init = Math.max(0, data.init);
                            e.preventDefault();
                            setPos = this.value.length + data.c;
                        }
                        else if (chara == dec_point) {
                            data.init = Math.max(0, data.init);
                            e.preventDefault();
                        }
                        else if (decimals > 0 && code == 8 && start == this.value.length - decimals) {
                            e.preventDefault();
                            data.c--;
                            setPos = this.value.length + data.c;
                        }
                        else if (decimals > 0 && code == 8 && start > this.value.length - decimals) {
                            if (this.value === '')
                                return;
                            if (this.value.slice(start - 1, start) != '0') {
                                val = this.value.slice(0, start - 1) + '0' + this.value.slice(start);
                                $this.val(val.replace(regex_dec_num, '').replace(regex_dec, dec_point));
                            }
                            e.preventDefault();
                            data.c--;
                            setPos = this.value.length + data.c;
                        }
                        else if (code == 8 && this.value.slice(start - 1, start) == thousands_sep) {
                            e.preventDefault();
                            data.c--;
                            setPos = this.value.length + data.c;
                        }
                        else if (decimals > 0 &&
                            start == end &&
                            this.value.length > decimals + 1 &&
                            start > this.value.length - decimals - 1 && isFinite(+chara) &&
                            !e.metaKey && !e.ctrlKey && !e.altKey && chara.length === 1) {
                            if (end === this.value.length) {
                                val = this.value.slice(0, start - 1);
                            }
                            else {
                                val = this.value.slice(0, start) + this.value.slice(start + 1);
                            }
                            this.value = val;
                            setPos = start;
                        }
                        if (setPos === false && code === 44 && chara === dec_point)
                            setPos = this.value.indexOf(dec_point) + 1;
                        if (setPos !== false) {
                            setSelectionRange.apply(this, [setPos, setPos]);
                        }
                        $this.data('numFormat', data);
                    },
                    'keyup.format': function (e) {
                        var $this = $(this), data = $this.data('numFormat'), code = (e.keyCode ? e.keyCode : e.which), start = getSelection.apply(this, ['start']), setPos;
                        if (this.value === '' || (code < 48 || code > 57) && (code < 96 || code > 105) && code !== 8)
                            return;
                        $this.val($this.val());
                        if (decimals > 0) {
                            if (data.init < 1) {
                                start = this.value.length - decimals - (data.init < 0 ? 1 : 0);
                                data.c = start - this.value.length;
                                data.init = 1;
                                $this.data('numFormat', data);
                            }
                            else if (start > this.value.length - decimals && code != 8) {
                                data.c++;
                                $this.data('numFormat', data);
                            }
                        }
                        setPos = this.value.length + data.c;
                        if (((this.value.length - setPos) === data.decimals) && (String.fromCharCode(code) !== data.dec_point)) {
                            setPos -= 1;
                            console.log('set pos', data.dec_point, code, String.fromCharCode(code));
                        }
                        setSelectionRange.apply(this, [setPos, setPos]);
                    },
                    'paste.format': function (e) {
                        var $this = $(this), original = e.originalEvent, val = null;
                        if (window.clipboardData && window.clipboardData.getData) {
                            val = window.clipboardData.getData('Text');
                        }
                        else if (original.clipboardData && original.clipboardData.getData) {
                            val = original.clipboardData.getData('text/plain');
                        }
                        $this.val(val);
                        e.preventDefault();
                        return false;
                    }
                })
                    .each(function () {
                    var $this = $(this).data('numFormat', {
                        c: -(decimals + 1),
                        decimals: decimals,
                        thousands_sep: thousands_sep,
                        dec_point: dec_point,
                        regex_dec_num: regex_dec_num,
                        regex_dec: regex_dec,
                        init: false
                    });
                    if (this.value === '')
                        return;
                    $this.val($this.val());
                });
            }
            else {
                return this.each(function () {
                    var $this = $(this), num = +$this.text().replace(regex_dec_num, '').replace(regex_dec, '.');
                    $this.number(!isFinite(num) ? 0 : +num, decimals, dec_point, thousands_sep);
                });
            }
        }
        return this.text($.number.apply(window, arguments));
    };
    var origHookGet = null, origHookSet = null;
    if ($.isPlainObject($.valHooks.text)) {
        if ($.isFunction($.valHooks.text.get))
            origHookGet = $.valHooks.text.get;
        if ($.isFunction($.valHooks.text.set))
            origHookSet = $.valHooks.text.set;
    }
    else {
        $.valHooks.text = {};
    }
    $.valHooks.text.get = function (el) {
        var $this = $(el), num, data = $this.data('numFormat');
        if (!data) {
            if ($.isFunction(origHookGet)) {
                return origHookGet(el);
            }
            else {
                return undefined;
            }
        }
        else {
            if (el.value === '')
                return '';
            num = +(el.value
                .replace(data.regex_dec_num, '')
                .replace(data.regex_dec, '.'));
            return '' + (isFinite(num) ? num : 0);
        }
    };
    $.valHooks.text.set = function (el, val) {
        var $this = $(el), data = $this.data('numFormat');
        if (!data) {
            if ($.isFunction(origHookSet)) {
                return origHookSet(el, val);
            }
            else {
                return undefined;
            }
        }
        else {
            return el.value = $.number(val, data.decimals, data.dec_point, data.thousands_sep);
        }
    };
    $.number = function (number, decimals, dec_point, thousands_sep) {
        thousands_sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep;
        dec_point = (typeof dec_point === 'undefined') ? '.' : dec_point;
        decimals = !isFinite(+decimals) ? 0 : Math.abs(decimals);
        var u_dec = ('\\u' + ('0000' + (dec_point.charCodeAt(0).toString(16))).slice(-4));
        var u_sep = ('\\u' + ('0000' + (thousands_sep.charCodeAt(0).toString(16))).slice(-4));
        number = (number + '')
            .replace('\.', dec_point)
            .replace(new RegExp(u_sep, 'g'), '')
            .replace(new RegExp(u_dec, 'g'), '.')
            .replace(new RegExp('[^0-9+\-Ee.]', 'g'), '');
        var n = !isFinite(+number) ? 0 : +number, s = '', toFixedFix = function (n, decimals) {
            var k = Math.pow(10, decimals);
            return '' + Math.round(n * k) / k;
        };
        s = (decimals ? toFixedFix(n, decimals) : '' + Math.round(n)).split('.');
        if (s[0].length > 3) {
            s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, thousands_sep);
        }
        if ((s[1] || '').length < decimals) {
            s[1] = s[1] || '';
            s[1] += new Array(decimals - s[1].length + 1).join('0');
        }
        return s.join(dec_point);
    };
})(jQuery);
(function () {
    class Comments {
        constructor(scope) {
            this.scope = scope;
            this.model = this.scope.$parent.model;
            this.scope.$parent.$watch('recordId', key => {
                this.items = null;
                this.scope.loading = Katrid.i18n.gettext('Loading...');
                clearTimeout(this._pendingOperation);
                this._pendingOperation = setTimeout(() => {
                    this._pendingOperation = null;
                    this.masterChanged(key);
                    return this.scope.$apply(() => {
                        return this.scope.loading = null;
                    });
                }, 1000);
            });
            this.items = [];
        }
        async masterChanged(key) {
            if (key) {
                const svc = new Katrid.Services.Model('mail.message');
                if (this.scope.$parent.record)
                    return svc.post('get_messages', { args: [this.scope.$parent.record.messages] })
                        .then(res => {
                        this.items = res;
                        this.scope.$apply();
                    });
            }
        }
        async _sendMesage(msg, attachments) {
            if (attachments)
                attachments = attachments.map((obj) => obj.id);
            let msgs = await this.model.post('post_message', { args: [[this.scope.$parent.recordId]], kwargs: { content: msg, content_subtype: 'html', format: true, attachments: attachments } });
            this.scope.message = '';
            this.items = msgs.concat(this.items);
            this.scope.$apply();
            this.scope.files = null;
            this.scope.hideEditor();
        }
        postMessage(msg) {
            if (this.scope.files.length) {
                let files = [];
                for (let f of this.scope.files)
                    files.push(f.file);
                var me = this;
                Katrid.Services.Attachments.upload({ files: files }, this.scope.$parent)
                    .done((res) => {
                    me._sendMesage(msg, res);
                });
            }
            else
                this._sendMesage(msg);
        }
    }
    Katrid.UI.uiKatrid.directive('comments', () => ({
        restrict: 'E',
        scope: {},
        replace: true,
        template: '<div class="content"><div class="comments"><mail-comments/></div></div>',
        link(scope, element, attrs) {
            if (element.closest('.modal-dialog').length)
                element.remove();
            else
                $(element).closest('.form-view[ng-form=form]').children('.content:first').append(element);
        }
    }));
    Katrid.UI.uiKatrid.directive('mailComments', () => ({
        restrict: 'E',
        controller: ['$scope', ($scope) => {
                $scope.comments = new Comments($scope);
                $scope.files = [];
                $scope.showEditor = () => {
                    $($scope.el).find('#mail-editor').show();
                    $($scope.el).find('#mail-msgEditor').focus();
                };
                $scope.hideEditor = () => {
                    $($scope.el).find('#mail-editor').hide();
                };
                $scope.attachFile = (file) => {
                    for (let f of file.files)
                        $scope.files.push({
                            name: f.name,
                            type: f.type,
                            file: f
                        });
                    $scope.$apply();
                };
                $scope.deleteFile = (idx) => {
                    $scope.files.splice(idx, 1);
                };
            }],
        replace: true,
        link(scope, element, attrs) {
            scope.el = element;
        },
        template() {
            return `
  <div class="container">
          <h3>${Katrid.i18n.gettext('Comments')}</h3>
          <div class="form-group">
          <button class="btn btn-outline-secondary" ng-click="showEditor();">${Katrid.i18n.gettext('New message')}</button>
          <button class="btn btn-outline-secondary">${Katrid.i18n.gettext('Log an internal note')}</button>
          </div>
          <div id="mail-editor" style="display: none;">
            <div class="form-group">
              <textarea id="mail-msgEditor" class="form-control" ng-model="message"></textarea>
            </div>
            <div class="form-group">
              <button class="btn btn-default" type="button" onclick="$(this).next().click()"><i class="fa fa-paperclip"></i></button>
              <input class="input-file-hidden" type="file" multiple onchange="angular.element(this).scope().attachFile(this)">
            </div>
            <div class="form-group" ng-show="files.length">
              <ul class="list-inline attachments-area">
                <li ng-repeat="file in files" ng-click="deleteFile($index)" title="${Katrid.i18n.gettext('Delete this attachment')}">{{ file.name }}</li>
              </ul>
            </div>
            <div class="from-group">
              <button class="btn btn-primary" ng-click="comments.postMessage(message)">${Katrid.i18n.gettext('Send')}</button>
            </div>
          </div>
  
          <hr>
  
          <div ng-show="loading">{{ loading }}</div>
          <div class="comment media col-sm-12" ng-repeat="comment in comments.items">
            <div class="media-left">
              <img src="/static/web/assets/img/avatar.png" class="avatar rounded">
            </div>
            <div class="media-body">
              <strong>{{ ::comment.author_name }}</strong> - <span class="timestamp text-muted" title="$\{ ::comment.date_time|moment:'LLLL'}"> {{::comment.date_time|moment}}</span>
              <div class="clearfix"></div>
              <div class="form-group">
                {{::comment.content}}
              </div>
              <div class="form-group" ng-if="comment.attachments">
                <ul class="list-inline">
                  <li ng-repeat="file in comment.attachments">
                    {{file.mimetype}}
                    <div class="comment-preview-image" ng-if="file.mimetype.startsWith('image')" style="width: 16%;height:100px;background-image:url('/web/content/$\{ ::file.id }')"></div>
                    <a href="/web/content/$\{ ::file.id }/?download">{{ ::file.name }}</a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
    </div>`;
        }
    }));
    class MailFollowers {
    }
    class MailComments extends Katrid.Forms.Widgets.Widget {
        static initClass() {
            this.prototype.tag = 'mail-comments';
        }
        spanTemplate(scope, el, attrs, field) {
            return '';
        }
    }
    MailComments.initClass();
    Katrid.Forms.Widgets.MailComments = MailComments;
})();
var Katrid;
(function (Katrid) {
    var Forms;
    (function (Forms) {
        var Widgets;
        (function (Widgets) {
            class PlotlyChart extends HTMLElement {
                connectedCallback() {
                    let title = this.getAttribute('data-title');
                    let layout = {};
                    if (title)
                        layout.title = title;
                    let serviceName = this.getAttribute('data-service');
                    let url = this.getAttribute('data-url');
                    let queryId = this.getAttribute('data-query-id');
                    if (serviceName) {
                        let method = this.getAttribute('data-method');
                        let service = new Katrid.Services.Model(serviceName);
                        service.rpc(method)
                            .then((res) => {
                            if (_.isString(res))
                                res = JSON.parse(res);
                            Plotly.plot(this, JSON.parse(res), layout, { responsive: true });
                        });
                    }
                    else if (queryId) {
                        let x = this.getAttribute('data-x');
                        let y = this.getAttribute('data-y');
                        let marker = this.getAttribute('data-marker');
                        if (marker)
                            marker = JSON.parse(marker);
                        let fields;
                        if (!x)
                            fields = [x, y];
                        if (!x)
                            x = 0;
                        if (!y)
                            y = 1;
                        Katrid.Services.Query.read({ id: queryId, as_dict: false, fields })
                            .then((res) => {
                            let chartType = this.getAttribute('chart-type');
                            if (!chartType)
                                chartType = 'bar';
                            let axis = this.transformData(res.data, x, y);
                            let data = { chartType, x: axis.x, y: axis.y, marker };
                            Plotly.plot(this, data, layout, { responsive: true });
                        });
                    }
                }
                transformData(data, x, y) {
                    let rx = [];
                    let ry = [];
                    for (let obj of data) {
                        rx.push(obj[x]);
                        ry.push(obj[y]);
                    }
                    return { x: rx, y: ry };
                }
            }
            Widgets.PlotlyChart = PlotlyChart;
            Katrid.define('plotly-chart', PlotlyChart);
        })(Widgets = Forms.Widgets || (Forms.Widgets = {}));
    })(Forms = Katrid.Forms || (Katrid.Forms = {}));
})(Katrid || (Katrid = {}));
(function ($) {
    $.fn.tabset = function () {
        this.addClass('col-12');
        let nav = $('<nav><div class="nav nav-tabs" role="tablist"></div></nav>');
        let div = nav.find('div');
        let tabContent = $('<div class="tab-content"></div>');
        let i = 0;
        for (let child of this.children('tab')) {
            let navItem = $(`<a class="nav-item nav-link" role="tab"></a>`);
            let heading = child.querySelector('tab-heading');
            navItem.data('index', i);
            navItem.html(heading.innerHTML);
            if (child.hasAttribute('ng-show'))
                navItem.attr('ng-show', child.getAttribute('ng-show'));
            if (child.hasAttribute('ng-if'))
                navItem.attr('ng-if', child.getAttribute('ng-if'));
            div.append(navItem);
            heading.remove();
            child.classList.add('tab-pane', 'row');
            child.setAttribute('role', 'tabpanel');
            tabContent.append(child);
            navItem.click(function () {
                $(this).tab('show');
                tabContent.find('.tab-pane.active').removeClass('active show');
                child.classList.add('active', 'show');
            });
            if (i === 0)
                navItem.click();
            i++;
        }
        this.append(nav);
        this.append(tabContent);
        return this;
    };
})(jQuery);
(function () {
    class Telegram {
        static async export(report, format) {
            console.log('export telegram');
            let templ = Katrid.app.$templateCache.get('reportbot.dialog.contacts');
            let modal = $(templ);
            $('body').append(modal);
            let sel = modal.find('#id-reportbot-select-contacts');
            let partners = new Katrid.Services.Model('res.partner');
            let res = await partners.post('get_telegram_contacts');
            if (res) {
                if (res)
                    res.map(c => sel.append(`<option value="${c[0]}">${c[1]}</option>`));
                sel.select2();
            }
            modal.find('#id-btn-ok').click(async () => {
                let svc = new Katrid.Services.Model('telegram.pending');
                format = 'pdf';
                const params = report.getUserParams();
                let res = svc.post('export_report', { args: [report.info.id], kwargs: { contacts: sel.val(), format, params } });
                if (res.ok)
                    console.log('ok');
            });
            modal.modal();
            return true;
        }
    }
    Katrid.Reports.Telegram = Telegram;
})();
var Katrid;
(function (Katrid) {
    var UI;
    (function (UI) {
        const DEFAULT_EXPAND_CLASS = 'fa-caret-right';
        const DEFAULT_COLLAPSE_CLASS = 'fa-caret-down';
        class Component {
            get el() {
                return this._el;
            }
            set el(value) {
                this.setElement(value);
            }
            setElement(el) {
                this._el = el;
                el.katrid = { object: this };
            }
        }
        UI.Component = Component;
        class TreeNode extends Component {
            constructor(treeView, item) {
                super();
                this.treeView = treeView;
                this._selected = false;
                this._expanded = false;
                this._level = 0;
                this._children = [];
                let el;
                if (item instanceof HTMLElement)
                    this.el = item;
                else if (item) {
                    this.data = item;
                    el = document.createElement('li');
                    el.classList.add('tree-node');
                    let a = document.createElement('a');
                    a.addEventListener('mousedown', (evt) => {
                        evt.preventDefault();
                        this.treeView.el.focus();
                    });
                    a.addEventListener('click', () => this.select());
                    a.addEventListener('dblclick', (evt) => {
                        evt.preventDefault();
                        this.expanded = !this.expanded;
                    });
                    this._ul = document.createElement('ul');
                    a.classList.add('tree-item');
                    el.appendChild(a);
                    el.appendChild(this._ul);
                    this.el = el;
                    this._a = a;
                    this._canExpand = true;
                    this._exp = document.createElement('span');
                    this._exp.addEventListener('dblclick', (evt) => evt.stopPropagation());
                    this._exp.addEventListener('click', (evt) => {
                        evt.preventDefault();
                        this.expanded = !this.expanded;
                    });
                    this._exp.classList.add('fa', 'fa-fw');
                    a.appendChild(this._exp);
                    if (_.isString(item.icon)) {
                        this._iconElement = document.createElement('span');
                        this._iconElement.classList.add('icon', 'fa', 'fa-fw');
                        this._iconElement.classList.add(item.icon);
                        a.appendChild(this._iconElement);
                    }
                    a.appendChild(document.createTextNode(item.text));
                }
            }
            get children() {
                return this._children;
            }
            select() {
                this.treeView.selection = [this];
            }
            collapse() {
                this.expanded = false;
            }
            expand() {
                this.expanded = true;
            }
            get expanded() {
                return this._expanded;
            }
            set expanded(value) {
                this._expanded = value;
                if (value) {
                    this.el.classList.add('expanded');
                    this._exp.classList.remove(DEFAULT_EXPAND_CLASS);
                    this._exp.classList.add(DEFAULT_COLLAPSE_CLASS);
                }
                else {
                    this.el.classList.remove('expanded');
                    this._exp.classList.remove(DEFAULT_COLLAPSE_CLASS);
                    this._exp.classList.add(DEFAULT_EXPAND_CLASS);
                }
            }
            get index() {
                if (this._parent)
                    return this._parent.children.indexOf(this);
                else
                    return this.treeView.nodes.indexOf(this);
            }
            get previousSibling() {
                let nodes;
                if (this._parent)
                    nodes = this._parent.children;
                else
                    nodes = this.treeView.nodes;
                return nodes[this.index - 1];
            }
            get nextSibling() {
                let nodes;
                if (this._parent)
                    nodes = this._parent.children;
                else
                    nodes = this.treeView.nodes;
                return nodes[this.index + 1];
            }
            get previous() {
                let p = this.previousSibling;
                if (p && p._expanded && p.children && p.children.length)
                    return p.last;
                if (this._parent)
                    return this._parent;
                return p;
            }
            get next() {
                if (this._expanded && this.children.length)
                    return this.first;
                let n = this.nextSibling;
                if (n && n._expanded && n.children && n.children.length)
                    return n.first;
                else if (this._parent)
                    return this._parent.nextSibling;
                return n;
            }
            get first() {
                return this.children[0];
            }
            get last() {
                return this.children[this.children.length - 1];
            }
            get selected() {
                return this._selected;
            }
            set selected(value) {
                this._selected = value;
                if (value)
                    this._a.classList.add('selected');
                else
                    this._a.classList.remove('selected');
                if (!this.treeView.selection.includes(this))
                    this.treeView.selection.push(this);
            }
            get parent() {
                return this._parent;
            }
            set parent(value) {
                if (this._parent)
                    this._parent.remove(this);
                this._parent = value;
                if (value)
                    value.add(this);
            }
            add(node) {
                this.children.push(node);
                this._ul.appendChild(node.el);
                this.update();
                node.calcLevel();
            }
            remove(node) {
                this.children.splice(this.children.indexOf(node), 1);
                this.update();
                node.calcLevel();
            }
            calcLevel() {
                this.level = this._parent.level + 1;
            }
            update() {
                if (this._canExpand && this.children.length)
                    this._exp.classList.add(DEFAULT_EXPAND_CLASS);
                else
                    this._exp.classList.remove(DEFAULT_COLLAPSE_CLASS);
            }
            get level() {
                return this._level;
            }
            set level(value) {
                console.log('set level', value, this._level);
                if (value !== this._level) {
                    for (let c of this.el.querySelectorAll('.indent'))
                        c.parentNode.removeChild(c);
                    let delta = value - this._level;
                    this._level = value;
                    for (let n of this.all())
                        n.level -= delta;
                    for (let c = 0; c < this._level; c++) {
                        let indent = document.createElement('span');
                        indent.classList.add('indent');
                        this._a.prepend(indent);
                    }
                }
            }
            *all() {
                for (let x of this.children) {
                    for (let y of x.all())
                        yield y;
                    yield x;
                }
            }
        }
        UI.TreeNode = TreeNode;
        class TreeView {
            constructor(cfg) {
                this._selection = [];
                this.el = cfg.dom;
                this.nodes = [];
                if (cfg.items)
                    this.addNodes(cfg.items);
                this.el.classList.add('tree-view');
                this.el.tabIndex = 0;
                this.el.addEventListener('keydown', (evt) => {
                    console.log('key down;');
                    let n;
                    switch (evt.key) {
                        case 'ArrowDown':
                            console.log('arrow down;;');
                            this.next();
                            break;
                        case 'ArrowUp':
                            this.previous();
                            break;
                        case 'ArrowRight':
                            n = this.currentNode;
                            if (n && n.children.length) {
                                if (n.expanded)
                                    n.next.select();
                                else
                                    n.expand();
                            }
                            else
                                this.next();
                            break;
                        case 'ArrowLeft':
                            n = this.currentNode;
                            if (n && n.children.length) {
                                if (n.expanded)
                                    n.collapse();
                                else
                                    n.previous.select();
                            }
                            else
                                this.previous();
                            break;
                    }
                });
            }
            get selection() {
                return this._selection;
            }
            set selection(value) {
                for (let node of this._selection)
                    node.selected = false;
                this._selection = value;
                for (let node of value)
                    node.selected = true;
                let evt = new CustomEvent('selectionchange', { detail: { selection: value } });
                this.el.dispatchEvent(evt);
            }
            get firstNode() {
                if (this.nodes.length)
                    return this.nodes[0];
            }
            get lastNode() {
                if (this.nodes.length)
                    return this.nodes[this.nodes.length - 1];
            }
            previous() {
                let curNode = this.currentNode;
                if (curNode) {
                    let n = curNode.previous;
                    if (n)
                        n.select();
                }
                else
                    this.lastNode.select();
            }
            next() {
                let curNode = this.currentNode;
                if (curNode) {
                    let n = curNode.next;
                    if (n)
                        n.select();
                }
                else
                    this.firstNode.select();
            }
            addNodes(nodes, parent = null) {
                for (let node of nodes) {
                    let item = this.addNode(node, parent);
                    if (node.children)
                        this.addNodes(node.children, item);
                }
            }
            addNode(item, parent) {
                let r;
                if (item instanceof HTMLElement) { }
                else if (typeof item === 'string')
                    item = { text: item };
                console.log(item);
                r = new TreeNode(this, item);
                if (parent)
                    r.parent = parent;
                else {
                    this.nodes.push(r);
                    console.log(r.el);
                    this.el.appendChild(r.el);
                }
                return r;
            }
            get currentNode() {
                if (this.selection.length)
                    return this.selection[this.selection.length - 1];
            }
        }
        UI.TreeView = TreeView;
    })(UI = Katrid.UI || (Katrid.UI = {}));
})(Katrid || (Katrid = {}));
(function () {
    class BaseTemplate {
        getSettingsDropdown(viewType) {
            if (viewType === 'form') {
                return `<ul class="dropdown-menu pull-right">
    <li>
      <a href="javascript:void(0);" ng-click="action.showDefaultValueDialog()">${Katrid.i18n.gettext('Set Default')}</a>
    </li>
  </ul>`;
            }
        }
        getSetDefaultValueDialog() {
            return `\
  <div class="modal fade" id="set-default-value-dialog" tabindex="-1" role="dialog">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <button type="button" class="close" data-dismiss="modal" aria-label="${Katrid.i18n.gettext('Close')}"><span aria-hidden="true">&times;</span></button>
          <h4 class="modal-title">${Katrid.i18n.gettext('Set Default')}</h4>
        </div>
        <div class="modal-body">
          <select class="form-control" id="id-set-default-value">
            <option ng-repeat="field in view.fields">{{ field.caption }} = {{ record[field.name] }}</option>
          </select>
          <div class="radio">
            <label><input type="radio" name="public">${Katrid.i18n.gettext('Only me')}</label>
          </div>
          <div class="radio">
            <label><input type="radio" name="public">${Katrid.i18n.gettext('All users')}</label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary">${Katrid.i18n.gettext('Save')}</button>
          <button type="button" class="btn btn-default" data-dismiss="modal">${Katrid.i18n.gettext('Cancel')}</button>
        </div>
      </div>
    </div>
  </div>\
  `;
        }
        static get cssListClass() {
            return 'table table-striped table-bordered table-condensed table-hover display responsive nowrap dataTable no-footer dtr-column';
        }
        renderList(scope, element, attrs, rowClick, parentDataSource, showSelector = true) {
            let ths = '<th ng-show="dataSource.groups.length"></th>';
            let tfoot = false;
            let totals = [];
            let cols = `<td ng-show="dataSource.groups.length" class="group-header">
  <div ng-show="record._group">
  <span class="fa fa-fw fa-caret-right"
    ng-class="{'fa-caret-down': record._group.expanded, 'fa-caret-right': record._group.collapsed}"></span>
    {{::record._group.__str__}} ({{::record._group.count }})</div></td>`;
            if (showSelector) {
                ths += `<th class="list-record-selector"><input type="checkbox" ng-click="action.selectToggle($event.currentTarget)" onclick="$(this).closest('table').find('td.list-record-selector input').prop('checked', $(this).prop('checked'))"></th>`;
                cols += `<td class="list-record-selector" onclick="event.stopPropagation();"><input title="teste" type="checkbox" ng-click="action.selectToggle($event.currentTarget)" onclick="if (!$(this).prop('checked')) $(this).closest('table').find('th.list-record-selector input').prop('checked', false)"></td>`;
            }
            for (let col of Array.from(element.children())) {
                let colHtml = col.outerHTML;
                col = $(col);
                let name = col.attr('name');
                if (!name) {
                    cols += `<td>${col.html()}</td>`;
                    ths += "<th><span>${col.attr('label')}</span></th>";
                    continue;
                }
                let total = col.attr('total');
                if (total) {
                    totals.push([name, total]);
                    tfoot = true;
                }
                else
                    totals.push(total);
                name = col.attr('name');
                const fieldInfo = scope.view.fields[name];
                if ((col.attr('visible') === 'False') || (fieldInfo.visible === false))
                    continue;
                let _widget = fieldInfo.createWidget(col.attr('widget'), scope, col, col);
                _widget.inList = true;
                _widget.inplaceEditor = Boolean(scope.inline);
                ths += _widget.th(col.attr('label'));
                cols += _widget.td(scope.inline, colHtml, col);
            }
            if (parentDataSource) {
                ths += '<th class="list-column-delete" ng-show="parent.dataSource.changing && !dataSource.readonly">';
                cols += '<td class="list-column-delete" ng-show="parent.dataSource.changing && !dataSource.readonly" ng-click="removeItem($index);$event.stopPropagation();"><i class="fa fa-trash-o"></i></td>';
            }
            if ((rowClick == null)) {
                rowClick = 'action.listRowClick($index, row, $event)';
            }
            if (tfoot)
                tfoot = `<tfoot><tr>${totals.map(t => (t ? `<td class="text-right"><strong><ng-total field="${t[0]}" type="${t[1]}"></ng-total></ strong></td>` : '<td class="borderless"></td>')).join('')}</tr></tfoot>`;
            else
                tfoot = '';
            let gridClass = ' grid';
            if (scope.inline)
                gridClass += ' inline-editor';
            return `<table class="${this.constructor.cssListClass}${gridClass}">
  <thead><tr>${ths}</tr></thead>
  <tbody>
  <tr ng-repeat="record in records | limitTo:totalDisplayed" ng-click="${rowClick}" ng-class="{'group-header': record._hasGroup, 'form-data-changing': (dataSource.changing && dataSource.recordIndex === $index), 'form-data-readonly': !(dataSource.changing && dataSource.recordIndex === $index)}" ng-form="grid-row-form-{{$index}}" id="grid-row-form-{{$index}}">${cols}</tr>
  </tbody>
  ${tfoot}
  </table>
  <a href="javascript:void(0)" ng-show="records.length > totalDisplayed" ng-click="totalDisplayed = totalDisplayed + 1000">${Katrid.i18n.gettext('View more...')}</a>
  `;
        }
        renderGrid(scope, element, attrs, rowClick) {
            const tbl = this.renderList(scope, element, attrs, rowClick, true, false);
            let buttons;
            if (attrs.inline == 'inline')
                buttons = `
<button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="parent.dataSource.changing && !dataSource.changing" type="button">${Katrid.i18n.gettext('Add')}</button>
<button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="dataSource.changing" type="button">${Katrid.i18n.gettext('Save')}</button>
<button class="btn btn-xs btn-info" ng-click="cancelChanges()" ng-show="dataSource.changing" type="button">${Katrid.i18n.gettext('Cancel')}</button>
`;
            else
                buttons = `
<button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="parent.dataSource.changing" type="button">${Katrid.i18n.gettext('Add')}</button>
<button class="btn btn-xs btn-outline-secondary float-right" ng-click="pasteData()" ng-show="parent.dataSource.changing" type="button" title="${Katrid.i18n.gettext('Paste')}">
<i class="fa fa-clipboard"></i>
</button>
`;
            return `<div style="overflow-x: auto;"><div ng-show="!dataSource.readonly">
  ${buttons}
  </div><div class="row inline-input-dialog" ng-show="dataSource.changing"/>${tbl}</div>`;
        }
        windowDialog(scope) {
            console.log('window dialog', scope);
            return `\
  <div class="modal fade" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
          <h4 class="modal-title" id="myModalLabel">
          {{dialogTitle}}
          {{action.info.display_name}}</h4>
        </div>
        <div class="modal-body">
    <div class="modal-dialog-body" ng-class="{'form-data-changing': dataSource.changing}"></div>
  <div class="clearfix"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" type="button" ng-click="dataSource.saveAndClose()" ng-show="dataSource.changing">${Katrid.i18n.gettext('Save')}</button>
          <button type="button" class="btn btn-default" type="button" data-dismiss="modal" ng-show="dataSource.changing">${Katrid.i18n.gettext('Cancel')}</button>
          <button type="button" class="btn btn-default" type="button" data-dismiss="modal" ng-show="!dataSource.changing">${Katrid.i18n.gettext('Close')}</button>
        </div>
      </div>
    </div>
  </div>\
  `;
        }
        renderReportDialog(scope) {
            return `<div ng-controller="ReportController">
  <form id="report-form" method="get" action="/web/reports/report/">
    <div class="data-heading panel panel-default">
      <div class="panel-body">
      <h2>{{ report.name }}</h3>
      <div class="toolbar">
        <button class="btn btn-primary" type="button" ng-click="report.preview()"><span class="fa fa-print fa-fw"></span> ${Katrid.i18n.gettext('Preview')}</button>
  
        <div class="btn-group">
          <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"
                  aria-expanded="false">${Katrid.i18n.gettext('Export')} <span class="caret"></span></button>
          <ul class="dropdown-menu">
            <li><a ng-click="Katrid.Reports.Reports.preview()">PDF</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('docx')">Word</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('xlsx')">Excel</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('pptx')">PowerPoint</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('csv')">CSV</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('txt')">${Katrid.i18n.gettext('Text File')}</a></li>
          </ul>
        </div>
  
        <div class="btn-group">
          <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"
                  aria-expanded="false">${Katrid.i18n.gettext('My reports')} <span class="caret"></span></button>
          <ul class="dropdown-menu">
            <li><a ng-click="Katrid.Reports.Reports.preview()">PDF</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('docx')">Word</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('xlsx')">Excel</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('pptx')">PowerPoint</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('csv')">CSV</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('txt')">${Katrid.i18n.gettext('Text File')}</a></li>
          </ul>
        </div>
  
      <div class="pull-right btn-group">
        <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"
                aria-expanded="false"><i class="fa fa-gear fa-fw"></i></button>
        <ul class="dropdown-menu">
          <li><a href="javascript:void(0)" ng-click="report.saveDialog()">${Katrid.i18n.gettext('Save')}</a></li>
          <li><a href="#">${Katrid.i18n.gettext('Load')}</a></li>
        </ul>
      </div>
  
      </div>
    </div>
    </div>
    <div class="col-sm-12">
      <table class="col-sm-12" style="margin-top: 20px; display:none;">
        <tr>
          <td colspan="2" style="padding-top: 8px;">
            <label>${Katrid.i18n.gettext('My reports')}</label>
  
            <select class="form-control" ng-change="action.userReportChanged(action.userReport.id)" ng-model="action.userReport.id">
                <option value=""></option>
                <option ng-repeat="rep in userReports" value="{{ rep.id }}">{{ rep.name }}</option>
            </select>
          </td>
        </tr>
      </table>
    </div>
  <div id="report-params">
  <div id="params-fields" class="col-sm-12 form-group">
    <div class="checkbox"><label><input type="checkbox" ng-model="paramsAdvancedOptions"> ${Katrid.i18n.gettext('Advanced options')}</label></div>
    <div ng-show="paramsAdvancedOptions">
      <div class="form-group">
        <label>${Katrid.i18n.gettext('Printable Fields')}</label>
        <input type="hidden" id="report-id-fields"/>
      </div>
      <div class="form-group">
        <label>${Katrid.i18n.gettext('Totalizing Fields')}</label>
        <input type="hidden" id="report-id-totals"/>
      </div>
    </div>
  </div>
  
  <div id="params-sorting" class="col-sm-12 form-group">
    <label class="control-label">${Katrid.i18n.gettext('Sorting')}</label>
    <select multiple id="report-id-sorting"></select>
  </div>
  
  <div id="params-grouping" class="col-sm-12 form-group">
    <label class="control-label">${Katrid.i18n.gettext('Grouping')}</label>
    <select multiple id="report-id-grouping"></select>
  </div>
  
  <div class="clearfix"></div>
  
  </div>
    <hr>
      <table class="col-sm-12">
        <tr>
          <td class="col-sm-4">
            <select class="form-control" ng-model="newParam">
              <option value="">--- ${Katrid.i18n.gettext('FILTERS')} ---</option>
              <option ng-repeat="field in report.fields" value="{{ field.name }}">{{ field.label }}</option>
            </select>
          </td>
          <td class="col-sm-8">
            <button
                class="btn btn-default" type="button"
                ng-click="report.addParam(newParam)">
              <i class="fa fa-plus fa-fw"></i> ${Katrid.i18n.gettext('Add Parameter')}
            </button>
          </td>
        </tr>
      </table>
  <div class="clearfix"></div>
  <hr>
  <div id="params-params">
    <div ng-repeat="param in report.params" ng-controller="ReportParamController" class="row form-group">
      <div class="col-sm-12">
      <div class="col-sm-4">
        <label class="control-label">{{param.label}}</label>
        <select ng-model="param.operation" class="form-control" ng-change="param.setOperation(param.operation)">
          <option ng-repeat="op in param.operations" value="{{op.id}}">{{op.text}}</option>
        </select>
      </div>
      <div class="col-sm-8" id="param-widget"></div>
      </div>
    </div>
  </div>
  </form>
  </div>\
  `;
        }
    }
    Katrid.UI.utils = {
        BaseTemplate,
        Templates: new BaseTemplate()
    };
})();
var Katrid;
(function (Katrid) {
    var UI;
    (function (UI) {
        var Web;
        (function (Web) {
            class ActionView extends HTMLElement {
                connectedCallback() {
                    this.classList.add('action-view');
                }
            }
            Web.ActionView = ActionView;
            customElements.define('action-view', ActionView);
            class AttachmentsButton extends HTMLElement {
                connectedCallback() {
                    this.actionView = this.closest('action-view');
                    this._recordLoadedHook = async (evt) => {
                        clearTimeout(this._timeout);
                        let rec = evt.detail.record;
                        if (rec && rec.id)
                            this._timeout = setTimeout(async () => {
                                let model = new Katrid.Services.Model('ir.attachment');
                                let res = await model.search({ where: { model: this.actionView.action.model.name, object_id: evt.detail.record.id }, count: false });
                                if (res && res.data)
                                    this.actionView.action.attachments = res.data;
                            }, 1000);
                        else
                            setTimeout(() => {
                                this.actionView.action.attachments = [];
                            });
                    };
                    this.actionView.addEventListener("recordLoaded", this._recordLoadedHook);
                }
                disconnectedCallback() {
                    this.actionView.removeEventListener("recordLoaded", this._recordLoadedHook);
                }
                renderItems(items) {
                    for (let item of items)
                        this.renderItem(item);
                }
                renderItem(item) {
                    let a = document.createElement('a');
                    a.classList.add('dropdown-item position-relative');
                    a.setAttribute('href', item.download_url);
                    a.innerText = item.name;
                    a.innerHTML = `<span class="fa fa-times remove-attachment-button" title="${Katrid.i18n.gettext('Delete attachment')}"></span>`;
                    a.querySelector('span').onclick = (evt) => {
                        evt.preventDefault();
                        this.onDeleteAttachment(item);
                        evt.stopPropagation();
                    };
                }
                onDeleteAttachment(item) {
                }
            }
            customElements.define('attachments-button', AttachmentsButton);
        })(Web = UI.Web || (UI.Web = {}));
    })(UI = Katrid.UI || (Katrid.UI = {}));
})(Katrid || (Katrid = {}));
(function () {
    Katrid.$hashId = 0;
    _.mixin({
        hash(obj) {
            if (!obj.$hashId) {
                obj.$hashId = ++Katrid.$hashId;
            }
            return obj.$hashId;
        }
    });
    _.mixin({
        sum(iterable, member) {
            let r = 0;
            if (iterable)
                for (let row of iterable) {
                    let v = row[member];
                    if (!_.isNumber(v))
                        v = Number(v);
                    if (_.isNaN(v))
                        v = 0;
                    r += v;
                }
            return r;
        },
        avg(iterable, member) {
            if (iterable && iterable.length) {
                let r = 0;
                return _.sum(iterable, member) / iterable.length;
            }
        }
    });
})();
//# sourceMappingURL=katrid.js.map