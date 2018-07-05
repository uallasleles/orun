(function () {

  class ActionManager extends Array {
    constructor() {
      super();
      this.mainAction = null;
    }

    addAction(action) {
      if (!this.mainAction)
        this.mainAction = action;
      this.push(action);
    }

    removeAction(action) {
      this.splice(this.indexOf(action), this.length);
    }

    get action() {
      return this[this.length-1];
    }
    set action(action) {
      this.splice(this.indexOf(action) + 1, this.length);
    }

    clear() {
      this.length = 0;
      this.mainAction = null;
    }

    get path() {
      return this.action.path;
    }
  }

  class Action {
    static initClass() {
      this.actionType = null;
    }
    constructor(info, scope, location) {
      Katrid.Actions.actionManager.addAction(this);
      this.info = info;
      this.scope = scope;
      this.location = location;
      this.currentUrl = this.location.$$path;
    }

    getContext() {
      let ctx;
      if (_.isString(this.info.context))
        ctx = JSON.parse(this.info.context);
      if (!ctx)
        ctx = {};
      // ctx['params'] = this.location.$$search;
      return ctx;
    }

    doAction(act) {
      let type = act.type || act.action_type;
      return Katrid.Actions[type].dispatchAction(this, act);
    }

    openObject(service, id, evt) {
      if (this._unregisterHook)
        this._unregisterHook();

      evt.preventDefault();
      evt.stopPropagation();
      if (evt.ctrlKey) {
        window.open(evt.target.href);
        return false;
      }
      const url = `action/${ service }/view/`;
      this.location.path(url, this).search({
        view_type: 'form',
        id
      });
      return false;
    }

    restore() {}

    apply() {}
    backTo(index, viewType) {
      if (this._currentPath !==  this._unregisterHook && (Katrid.Actions.actionManager.length > 1))
        this._unregisterHook();

      // restore to query view
      let action = Katrid.Actions.actionManager[index];
      if ((index === 0) && (viewType === 0))
        return action.restore(action.searchViewType || action.viewModes[0]);
      else if ((index === 0) && (viewType === 'form'))
        return action.restore('form');

      Katrid.Actions.actionManager.action = action;

      if (!viewType)
        viewType = 'form';

      let location;
      location = action.currentUrl;
      action.info.__cached = true;
      let p = this.location.path(location, true, action.info);
      let search = action._currentParams[viewType];
      console.log('search', search);
      if (search)
        p.search(search);
    }

    execute() {}

    getCurrentTitle() {
      return this.info.display_name;
    }

    search() {
      if (!this.isDialog) {
        return this.location.search.apply(null, arguments);
      }
    }
  }
  Action.initClass();


  class WindowAction extends Action {
    static initClass() {
      this.actionType = 'ir.action.window';
    }
    constructor(info, scope, location) {
      super(info, scope, location);
      this.notifyFields = [];
      this.viewMode = info.view_mode;
      this.viewModes = this.viewMode.split(',');
      this.selectionLength = 0;
      this._cachedViews = {};
      this._currentParams = {};
      this._currentPath = null;
      this.searchView = null;
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

    restore(viewType) {
      // restore the last search mode view type
      let url = this._currentPath || this.location.$$path;
      let params = this._currentParams[viewType] || {};
      params['view_type'] = viewType;
      if (Katrid.Actions.actionManager.length > 1) {
        console.log(this.info);
        params['actionId'] = this.info.id;
        this.$state.go('actionView', params);
        // this.location.path(url);
        // this.location.search(params);
      } else {
        this.setViewType(viewType);
      }
      // window.location.href = '/web/#' + url + '?view_type=list';
      // this.setViewType(viewType, this._currentParams[viewType]);
    }

    // registerFieldNotify(field) {
    //   // Add field to notification list
    //   if (this.notifyFields.indexOf(field.name) === -1) {
    //     this.scope.$watch(`record.${field.name}`, () => console.log('field changed', field));
    //     return this.notifyFields.push(fields);
    //   }
    // }

    getCurrentTitle() {
      if (this.viewType === 'form') {
        return this.scope.record.display_name;
      }
      return super.getCurrentTitle();
    }

    createNew() {
      Katrid.Dialogs.WaitDialog.show();
      this.setViewType('form');
      setTimeout(() => {
        this.dataSource.insert();
      }, 10);
    }

    deleteSelection() {
      let sel = this.selection;
      if (
        ((sel.length === 1) && confirm(Katrid.i18n.gettext('Confirm delete record?'))) ||
        ((sel.length > 1) && confirm(Katrid.i18n.gettext('Confirm delete records?')))
      ) {
        this.model.destroy(sel);
        const i = this.scope.records.indexOf(this.scope.record);
        this.setViewType('list');
        this.dataSource.refresh();
      }
    }

    copy() {
      this.setViewType('form');
      this.dataSource.copy(this.scope.record.id);
      return false;
    }

    async routeUpdate(search) {
      const viewType = this.viewType;
      let oldViewType = this._currentViewType;

      if (viewType != null) {
        if ((this.scope.records == null)) {
          this.scope.records = [];
        }
        if (this.viewType !== oldViewType) {
          console.log('change route', viewType);
          this.dataSource.pageIndex = null;
          this.dataSource.record = {};
          this.viewType = viewType;
          // let r = await this.execute();
          this._currentViewType = this.viewType;
          this.setViewType(viewType, search);
          //if (r !== true)
          //  return this.routeUpdate(this.location.$$search);
        }

        if (Katrid.UI.Views.searchModes.includes(this.viewType) && (search.page !== this.dataSource.pageIndex)) {
          const filter = this.searchParams || {};
          const fields = Object.keys(this.view.fields);
          this.dataSource.pageIndex = parseInt(search.page);
          this.dataSource.limit = parseInt(search.limit || this.info.limit);
          await this.dataSource.search(filter, this.dataSource.pageIndex || 1, fields);
        } else if (search.id && (this.dataSource.recordId !== search.id)) {
          this.scope.record = null;
          this.dataSource.get(search.id);
        }

        if ((search.page == null) && (this.viewType !== 'form')) {
          this.location.search('page', 1);
          this.location.search('limit', this.info.limit);
        }


      } else {
        // this.setViewType(this.viewType);
      }

      this._currentParams[this.viewType] = jQuery.extend({}, search);
      this._currentPath = this.location.$$path;

      if (search.title)
        this.info.display_name = search.title;

    }

    _setViewType(viewType) {
      // TODO optimize the view transitions: if oldview in searchModes and newview in searchModes change content only
      let saveState = this.viewType && this.searchView;

      if (viewType === 0)
        for (let v of this.viewModes) if (v !== 'form') {
          viewType = v;
          break;
        }

      // save previous state
      let data;
      if (saveState) {
        data = this.searchView.dump();
        this.searchParams = this.searchView.query.getParams();
      }

      const search = this.location.$$search;
      if (viewType !== 'form')
        delete search.id;
      search.view_type = viewType;

      this.routeUpdate(search);
      this.location.search(search);

      // restore previous state
      if (saveState)
        setTimeout(() => this.searchView.load(data), 0);
    }

    get dataSource() {
      return this.scope.dataSource;
    }

    apply() {
      if (this.viewModes.length) {
        let templ = [];
        for (let [k, v] of Object.entries(this.views)) {
          let viewCls = Katrid.UI.Views[k];
          if (viewCls) {
            let view = new viewCls(this, this.scope, v, v.content);
            this._cachedViews[k] = view;
            let s = view.render();
            if (!_.isString(s))
              s = s[0].outerHTML;
            templ.push(`<div class="action-view" ng-if="action.viewType === '${k}'">${s}</div>`);
          }
        }
        this._template = templ.join('');
      } else {
        // this.render(this.scope, this.scope.view.content, this.viewType);
        let viewCls = Katrid.UI.Views[this.viewType];
        let view = new viewCls(this, this.scope, this.view, this.view.content);

        this._cachedViews[this.viewType] = view;
        this._template = view.render();
        // Katrid.core.setContent(cache, this.scope);
        // if (Katrid.UI.Views.searchModes.includes(this.viewType)) this.lastViewType = this.viewType;
        // return this.routeUpdate(this.location.$$search);
      }
    }

    async execute() {
      if (!this.views) {
        let res = await this.model.loadViews({
          views: this.info.views,
          action: this.info.id,
          toolbar: true
        });
        this.fields = res.fields;
        this.fieldList = res.fieldList;
        console.log(this.fieldList);
        this.views = res.views;
      }
    }

    get viewType() {
      return this._viewType;
    }

    set viewType(value) {
      if (value === this._viewType)
        return;
      if (!this._viewType)
        this.searchViewType = this.viewModes[0];
      this.view = this.views[value];
      this._viewType = value;
    }

    setViewType(type, search) {
      this.viewType = type;
      if (!search)
        search = { view_type: type };
      this.location.search(search);
    }

    set view(value) {
      this._view = value;
      if (this.scope)
        this.scope.view = value;
    }

    get view() {
      return this._view;
    }

    get template() {
      if (!this._template)
        this.apply();
      return this._template;
    }

    render(scope, html, viewType) {
      if (!this.isDialog) {
        html = Katrid.UI.Utils.Templates[`preRender_${viewType}`](scope, html);
      }
      return Katrid.core.setContent(html, this.scope);
    }

    searchText(q) {
      return this.location.search('q', q);
    }

    _prepareParams(params) {
      const r = {};
      for (let p of Array.from(params)) {
        if (p.field && (p.field.type === 'ForeignKey')) {
          r[p.field.name] = p.id;
        } else {
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
      return this.dataSource.search(params);
    }

    applyGroups(groups) {
      return this.dataSource.groupBy(groups[0]);
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
        .then(function(res) {
          let msg, result;
          if (res.status === 'open') {
            return window.open(res.open);
          } else if (res.status === 'fail') {
            return (() => {
              result = [];
              for (msg of Array.from(res.messages)) {
                result.push(Katrid.Dialogs.Alerts.error(msg));
              }
              return result;
            })();
          } else if ((res.status === 'ok') && res.result.messages) {
            return (() => {
              const result1 = [];
              for (msg of Array.from(res.result.messages)) {
                result1.push(Katrid.Dialogs.Alerts.success(msg));
              }
              return result1;
            })();
          }
        });
      }
    }

    async formButtonClick(id, meth, self) {
      const res = await this.scope.model.post(meth, { kwargs: { id: id } });
      if (res.ok && res.result.type) {
        const act = new (Katrid.Actions[res.result.type])(res.result, this.scope, this.scope.location);
        act.execute();
      }
    };

    doBindingAction(evt) {
      this.selection;
      Katrid.Services.Actions.load($(evt.currentTarget).data('id'))
      .then(action => {

        if (action.action_type === 'ir.action.report')
          ReportAction.dispatchBindingAction(this, action);

      });
    }

    listRowClick(index, row, evt) {
      const search = {
        view_type: 'form',
        id: row.id
      };
      if (evt.ctrlKey) {
        const url = `#${this.location.$$path}?${$.param(search)}`;
        window.open(url);
        return;
      }
      if (row._group) {
        row._group.expanded = !row._group.expanded;
        row._group.collapsed = !row._group.expanded;
        if (row._group.expanded) {
          this.dataSource.expandGroup(index, row);
        } else {
          this.dataSource.collapseGroup(index, row);
        }
      } else {
        this.dataSource.recordIndex = index;
        this.setViewType('form', search);
      }
    }

    autoReport() {
      return this.model.autoReport()
      .then(function(res) {
        if (res.ok && res.result.open) {
          return window.open(res.result.open);
        }
      });
    }

    showDefaultValueDialog() {
      const html = Katrid.UI.Utils.Templates.getSetDefaultValueDialog();
      const modal = $(Katrid.core.compile(html)(this.scope)).modal();
      modal.on('hidden.bs.modal', function() {
        $(this).data('bs.modal', null);
        return $(this).remove();
      });
    }

    selectToggle(el) {
      this._selection = $(el).closest('table').find('td.list-record-selector :checkbox').filter(':checked');
      this.selectionLength = this._selection.length;
    }

    get selection() {
      if (this._selection)
        return Array.from(this._selection).map((el) => ($(el).data('id')));
    }

    deleteAttachment(attachments, index) {
      let att = attachments[index];
      if (confirm(Katrid.i18n.gettext('Confirm delete attachment?'))) {
        attachments.splice(index, 1);
        Katrid.Services.Attachments.destroy(att.id);
      }
    }
  }
  WindowAction.initClass();


  class ReportAction extends Action {
    static initClass() {
      this.actionType = 'ir.action.report';
    }

    static async dispatchBindingAction(parent, action) {
      let format = localStorage.katridReportViewer || 'pdf';
      let sel = parent.selection;
      if (sel)
        sel = sel.join(',');
      let params = { data: [{ name: 'id', value: sel }] };
      const svc = new Katrid.Services.Model('ir.action.report');
      let res = await svc.post('export_report', { args: [action.id], kwargs: { format, params } });
      if (res.open)
        return window.open(res.open);
    }

    constructor(info, scope, location) {
      super(info, scope, location);
      this.userReport = {};
    }

    userReportChanged(report) {
      return this.location.search({
        user_report: report});
    }

    async routeUpdate(search) {
      this.userReport.id = search.user_report;
      if (this.userReport.id) {
        const svc = new Katrid.Services.Model('ir.action.report');
        let res = await svc.post('load_user_report', { kwargs: { user_report: this.userReport.id } });
        this.userReport.params = res.result;
      } else {
        // Katrid.core.setContent(, this.scope);
      }
    }

    get template() {
      return Katrid.Reports.Reports.renderDialog(this);
    }
  }
  ReportAction.initClass();


  class ViewAction extends Action {
    static initClass() {
      this.actionType = 'ir.action.view';
    }
    routeUpdate(search) {
      return Katrid.core.setContent(this.info.content, this.scope);
    }
  }
  ViewAction.initClass();


  class UrlAction extends Action {
    static initClass() {
      this.actionType = 'ir.action.url';
    }

    constructor(info, scope, location) {
      super(info, scope, location);
      window.location.href = info.url;
    }
  }
  UrlAction.initClass();


  class ClientAction extends Action {
    static initClass() {
      this.actionType = 'ir.action.client';
      this.registry = {};
      this.register('refresh', 'tag_refresh');
    }

    static register(tag, obj) {
      this.registry[tag] = obj;
    }

    static dispatchAction(parent, act) {
      // get action
      let action = this.registry[act.tag];
      if (action.prototype instanceof Katrid.UI.Views.ActionView) {
        action = new action(parent.scope);
        action.renderTo(parent);
      }
      else console.log('is a function');
    }

    tag_refresh() {
      this.dataSource.refresh();
    }

    execute() {
      let tag = ClientAction.registry[this.info.tag];
      if (tag.prototype instanceof Katrid.UI.Views.ClientView)
        this.tag = new tag(this);
      else if (_.isString(tag))
        this[tag].apply(this);
    }

    async routeUpdate(location) {
      // this.execute();
    }

    get template() {
      return this.tag.template;
    }
  }
  ClientAction.initClass();


  this.Katrid.Actions = {
    Action,
    WindowAction,
    ReportAction,
    ViewAction,
    UrlAction,
    ClientAction,
    ActionManager,
    actionManager: new ActionManager()
  };

  this.Katrid.Actions[WindowAction.actionType] = WindowAction;
  this.Katrid.Actions[ReportAction.actionType] = ReportAction;
  this.Katrid.Actions[ViewAction.actionType] = ViewAction;
  this.Katrid.Actions[UrlAction.actionType] = UrlAction;
  this.Katrid.Actions[ClientAction.actionType] = ClientAction;

})();

(function () {

  Katrid.bootstrap();

  const ngApp = angular.module('katridApp', ['ui.router', 'ngRoute', 'ngCookies', 'ngSanitize', 'cfp.hotkeys', 'ui.katrid'].concat(Katrid.Settings.additionalModules));

  ngApp.config(['$locationProvider', function($locationProvider) {
    $locationProvider.hashPrefix('');
  }]);

  ngApp.run(function ($rootScope, $state, $transitions) {
  });

  ngApp.run(
    ['$route', '$rootScope', '$location', '$templateCache', ($route, $rootScope, $location, $templateCache) => {
      Katrid.UI.Templates.init($templateCache);
      let original = $location.path;
      $location.path = function (path, reload, info) {
        if (info) {
          let un = $rootScope.$on('$locationChangeSuccess', function () {
            // use cached action info
            // $route.current.actionInfo = info;
            un();
          });
        }
        r = original.apply($location, [path]);
        return r;
      };
    }]
  );

  // const actionTempl = `<ui-view><h4 id="h-loading" class="ajax-loading-animation"><i class="fa fa-refresh fa-spin"></i> <span ng-bind="::_.gettext('Loading...')"></span></h4></ui-view>`;

  ngApp.config(function($stateProvider) {
    $stateProvider
    .state('menuEntry', {
      url: '/menu/:menuId/',
      controller: 'MenuController',
      reloadOnSearch: false
    })
    .state('actionView', {
      url: '/action/:actionId/?view_type&id',
      reloadOnSearch: false,
      controller: 'ActionController',
      resolve: {
        action: ['$stateParams', '$state', '$location',
          async ($stateParams, $state, $location) => {
            let params = $stateParams;
            Katrid.Actions.actionManager.clear();
            let info = await Katrid.Services.Actions.load(params.actionId);
            let model = new Katrid.Services.Model(info.model);
            let action = new (Katrid.Actions[info.action_type])(info, null, $location);
            action.model = model;
            $state.$current.data = { action };
            await action.execute();
            return action;
          }
        ]
      },
      templateProvider: async ($stateParams, $state) => {
        return $state.$current.data.action.template;
        // return $state.$current.data.action.template;
      }
    })
    .state('modelView', {
      url: '/action/:service/view/?view_type&id',
      controller: 'ActionController',
      reloadOnSearch: false,
      resolve: {
        action: ['$stateParams', '$state', '$location',
          async function($stateParams, $state, $location) {
            let info = await (
              new Katrid.Services.Model($stateParams.service))
              .rpc('get_formview_action', [$stateParams.id]
            );

            let model = info.model;
            if (model instanceof Array)
              model = model[1];
            model = new Katrid.Services.Model(model);
            let action = new (Katrid.Actions[info.action_type])(info, null, $location);
            action.model = model;
            $state.$current.data = { action };
            await action.execute();
            action.viewType = $stateParams.view_type;
            return action;

          }
        ],
      },
      templateProvider: ($stateParams, $state) => {
        return $state.$current.data.action.template;
      }

    });
  });


  ngApp.controller('MenuController', function($scope, $stateParams) {
    setTimeout(() => {
      let menu = $stateParams.menuId;
      let action = $(`#left-side-menu[data-menu-id='${ menu }']`).find('.menu-item-action').first();
      $scope.$parent.current_menu = parseInt(menu);
      action.click();
    }, 0);
  });


  ngApp.controller('LoginController', function($scope, $location) {
    $scope.login = (username, password) => {
      $scope.loading = true;
      Katrid.Services.Auth.login(username, password)
      .then(res => {
        if (res.success) {
          console.log(res.redirect);
          $scope.messages = [{ message: _.gettext('Loading...'), type: 'success' }];
          if ($location.$$url)
            window.location.href = '/web/#' + $location.$$url;
          else if (res.redirect)
            window.location.href = res.redirect;
        } else {
          $scope.loading = false;
          $scope.messages = [{ message: res.message, type: 'danger' }];
        }
        $scope.$apply();
      })
      .catch(() => {
        $scope.loading = false;
        $scope.$apply();
      });
    }
  });


  class DialogLocation {
    constructor() {
      this.$$search = {};
    }
    search() {}
  }

  let $set = function(field, value) {
    $scope.record[field] = value;
    $scope.$setDirty(field);
  };

  ngApp.controller('ActionController', function($scope, $compile, $state, $location, hotkeys, $element, action) {
    Katrid.core.compile = $compile;
    action.$state = $state;
    action.scope = $scope;
    action.$element = $element;
    console.log('action controller', $location);
    if (action instanceof Katrid.Actions.WindowAction)
      action.viewType = $location.$$search.view_type || action.viewModes[0];
    $scope.action = action;
    $scope.model = action.model;

    $scope._ = _;
    $scope.data = null;
    $scope.record = null;
    Object.defineProperty($scope, 'self', {
      get: () => ($scope.record)
    });
    $scope.recordIndex = null;
    $scope.recordId = null;
    $scope.records = null;
    $scope.recordCount = 0;
    $scope.dataSource = new Katrid.Data.DataSource($scope);
    $scope.$setDirty = (field) => {
      const control = $scope.form[field];
      if (control) {
        control.$setDirty();
      }
    };

    action.routeUpdate($location.$$search)
    .then(() => {
      action._unregisterHook = $scope.$on('$locationChangeSuccess', () => {
        action.routeUpdate($location.$$search);
      });
    });

    hotkeys.bindTo($scope)
    .add({
      combo: 'ctrl+s',
      description: 'Save record changes',
      allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
      callback: (evt) => {
        evt.preventDefault();
        $scope.dataSource.save();
      }
    })
    .add({
      combo: 'f2',
      description: 'Edit record',
      allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
      callback: (evt) => {
        evt.preventDefault();
        $scope.dataSource.edit();
        console.log('edit');
      }
    })
    .add({
      combo: 'esc',
      allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
      callback: (evt) => {
        if (!$(evt.target).hasClass('modal')) {
          let btn = $('.maximize-button').first();
          if ($scope.dataSource && $scope.dataSource.changing) {
            evt.preventDefault();
            $scope.dataSource.cancel();
          }
          else if (btn.closest('div.card.data-panel').hasClass('box-fullscreen')) {
            evt.preventDefault();
            btn.click();
          }
        }
      }
    });
  });


  ngApp.controller('ActionController1', function($scope, $compile, $location, $route, action, reset, hotkeys) {
    prepareScope($scope, $location);
    Katrid.core.setContent = setContent;
    Katrid.core.compile = $compile;
    $scope.Katrid = Katrid;

    $scope.$on('$locationChangeStart', function(event) {
      if ($scope.dataSource && $scope.dataSource._pendingChanges) {
        let answer = confirm(Katrid.i18n.gettext("You still have pending changes, are you sure you want to leave this page?"));
        if (!answer)
          event.preventDefault();
      }
    });

    let initAction = (action) => {
      let act, location;
      if ($scope.isDialog) location = new DialogLocation();
      else location = $location;

      $scope.action = act = new (Katrid.Actions[action.action_type])(action, $scope, location);
      // restored cached action datae
      if (action.__cached)
        act.views = Katrid.Actions.Action.history[Katrid.Actions.Action.history.length - 1].views;
      if (reset)
        Katrid.Actions.Action.history = [];
      Katrid.Actions.Action.history.push($scope.action);
      if (_.isArray(action.model))
        action.model = action.model[1];
      if (action.model)
        $scope.model = new Katrid.Services.Model(action.model, $scope);
      if ($scope.isDialog)
        act.isDialog = $scope.isDialog;
      if ($scope.parentAction)
        act.parentAction = $scope.parentAction;

      if (act && act.isDialog) {
        act.routeUpdate({ view_type: action.view_type });
        act.createNew();
      } else act.routeUpdate($location.$$search);
    };

    // Check if the element is a child
    if ($scope.parentAction) {
    } else {
      Katrid.core.rootElement = angular.element('#katrid-action-view');
      $scope.$on('$routeUpdate', () => $scope.action.routeUpdate($location.$$search));
      // $scope.$on('$locationChangeStart', () => console.log('location change start'));
    }
    initAction(action);
  });


  this.Katrid.ngApp = ngApp;

})();

(function () {

  const SESSION_USER_KEY = '_katridUser';
  
  class Auth {
    static initClass() {
      this.prototype.user = null;
    }
    constructor() {
      this.user = JSON.parse(window.sessionStorage.getItem(SESSION_USER_KEY));
      if ((this.user == null)) {
        this.user = {'is_authenticated': false};
      }
    }
  
    login(username, password) {
      const rpcName = Katrid.Settings.server + '/api/auth/login/';
      return $.ajax({
        method: 'POST',
        url: rpcName,
        data: JSON.stringify({'username': username, 'password': password}),
        contentType: "application/json; charset=utf-8",
        dataType: 'json'}).success(function(res) {
        console.log(res);
        return window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(res.result));
      });
    }
  
    loginRequired(path, urls, next) {
      if ((Array.from(urls).includes(path) && this.user.is_authenticated) || (!Array.from(urls).includes(path))) {
        return true;
      } else {
        return false;
      }
    }
  
    isAuthenticated() {
      const rpcName = Katrid.Settings.server + '/api/auth/login/';
      return $.get(rpcName);
    }
  }
  Auth.initClass();
  
  
  Katrid.Auth = new Auth();
  
});
(function () {

  const globals = this;

  this.Katrid = {
    ready(fn) {
      const script = $('script').first();
      return fn(angular.element($(script).parent()).scope());
    },

    bootstrap() {
      this.localSettings = new this.LocalSettings();
    },

    // Internationalization
    i18n: {
      languageCode: 'pt-BR',
      formats: {},
      catalog: {},

      initialize(plural, catalog, formats) {
        Katrid.i18n.plural = plural;
        Katrid.i18n.catalog = catalog;
        Katrid.i18n.formats = formats;
        if (plural) {
          Katrid.i18n.pluralidx = function(n) {
            if (plural instanceof boolean) {
              if (plural) { return 1; } else { return 0; }
            } else {
              return plural;
            }
          };
        } else {
          Katrid.i18n.pluralidx = function(n) {
            if (count === 1) { return 0; } else { return 1; }
          };
        }

        globals.pluralidx = Katrid.i18n.pluralidx;
        globals.gettext = Katrid.i18n.gettext;
        globals.ngettext = Katrid.i18n.ngettext;
        globals.gettext_noop = Katrid.i18n.gettext_noop;
        globals.pgettext = Katrid.i18n.pgettext;
        globals.npgettext = Katrid.i18n.npgettext;
        globals.interpolate = Katrid.i18n.interpolate;
        globals.get_format = Katrid.i18n.get_format;

        _.mixin({
          gettext: Katrid.i18n.gettext,
          sprintf: sprintf,
        });

        return Katrid.i18n.initialized = true;
      },

      merge(catalog) {
        return Array.from(catalog).map((key) =>
          (Katrid.i18n.catalog[key] = catalog[key]));
      },

      gettext(s) {
        const value = Katrid.i18n.catalog[s];
        if (value != null) {
          return value;
        } else {
          return s;
        }
      },

      gettext_noop(s) { return s; },

      ngettext(singular, plural, count) {
        const value = Katrid.i18n.catalog[singular];
        if (value != null) {
          return value[Katrid.i18n.pluralidx(count)];
        } else if (count === 1) {
          return singular;
        } else {
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
          fmt.replace(/%\(\w+\)s/g, match => String(obj[match.slice(2,-2)]));
        } else {
          fmt.replace(/%s/g, match => String(obj.shift()));
        }

        return {
          get_format(formatType) {
            const value = Katrid.i18n.formats[formatType];
            if (value != null) {
              return value;
            } else {
              return formatType;
            }
          }
        };
      }
    }
  };

  Katrid.core = {};

}).call(this);
(function () {

  let requestManager;
  class RequestManager {
    constructor() {
      this.requestId = 0;
      this.requests = {};
    }

    request() {
      const reqId = ++requestManager.requestId;
      const def = new $.Deferred();
      this.requests[reqId] = def;
      def.requestId = reqId;
      return def;
    }
  }


  if (Katrid.socketio) {
    requestManager = new RequestManager();

    Katrid.socketio.on('connect', () => console.log("I'm connected!"));

    Katrid.socketio.on('api', function (data) {
      if (_.isString(data)) {
        data = JSON.parse(data);
      }
      const def = requestManager.requests[data['req-id']];
      return def.resolve(data);
    });
  }


  class Service {
    static get url() { return '/api/rpc/' };

    constructor(name, scope) {
      this.name = name;
    }

    static _fetch(url, config, params) {
      if (params) {
        url = new URL(url);
        Object.entries(params).map((k, v) => url.searchParams.append(k, v));
      }
      return fetch(url, config);
    }

    static _post(url, data, params) {
      return this._fetch(url, {
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
      if (Katrid.Settings.servicesProtocol === 'ws') {
        // Using websocket protocol
        return Katrid.socketio.emit('api', {channel: 'rpc', service: this.name, method: name, data, args: params});
      } else {
        // Using http/https protocol
        const methName = this.name ? this.name + '/': '';
        const rpcName = Katrid.Settings.server + this.constructor.url + methName + name + '/';
        return $.get(rpcName, params);
      }
    }

    post(name, data, params) {
      let context = Katrid.Application.context;
      if (!data)
        data = {};
      if (context)
        data.context = context;

      data = {
        jsonrpc: '2.0',
        method: name,
        params: data,
        id: Math.floor(Math.random() * 1000 * 1000 * 1000)
      };

      // Check if protocol is socket.io
      if (Katrid.Settings.servicesProtocol === 'io') {
        const def = requestManager.request();
        Katrid.socketio.emit('api',
          {
            "req-id": def.requestId,
            "req-method": 'POST',
            service: this.name,
            method: name,
            data,
            args: params
          }
        );
        return def;

        // Else, using ajax
      } else {
        const methName = this.name ? this.name + '/': '';
        let rpcName = Katrid.Settings.server + this.constructor.url + methName + name + '/';
        if (params) {
          rpcName += `?${$.param(params)}`;
        }
        return new Promise(
          (resolve, reject) => {

            $.ajax({
              method: 'POST',
              url: rpcName,
              data: JSON.stringify(data),
              contentType: "application/json; charset=utf-8",
              dataType: 'json'
            })
            .then(res => {
              if (res.error)
                reject(res.error);
              else
                resolve(res.result);
            })
            .fail(res => reject(res));

          }
        );
      }
    }
  }


  class Model extends Service {
    searchName(name) {
      if (_.isString(name))
        name = { args: name };
      return this.post('search_name', name);
    }

    createName(name) {
      let kwargs = {name};
      return this.post('create_name', { kwargs: kwargs });
    }

    search(data, params) {
      return this.post('search', { kwargs: data }, params);
    }

    destroy(id) {
      if (!_.isArray(id))
        id = [id];
      return this.post('destroy', { kwargs: {ids: id} });
    }

    getById(id) {
      return this.post('get', { args: [id] });
    }

    getDefaults() {
      return this.post('get_defaults', {});
    }

    copy(id) {
      return this.post('copy', { args: [id] });
    }

    static _prepareFields(res) {
      if (res) {
        res.fields = Katrid.Data.Fields.Field.fromArray(res.fields);
        res.fieldList = Object.values(res.fields);
        Object.values(res.views).map(v => v.fields = Katrid.Data.Fields.Field.fromArray(v.fields));
        Object.keys(res.views).map(k => res.views[k] = new Katrid.Data.View(res.views[k]));
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

    getFieldChoices(field, term) {
      return this.post('get_field_choices', { args: [ field, term ]} );
    }

    doViewAction(data) {
      return this.post('do_view_action', { kwargs: data });
    }

    write(data, params) {
      return new Promise((resolve, reject) => {
        this.post('write', {kwargs: {data}}, params)
          .then((res) => {
            Katrid.Dialogs.Alerts.success(Katrid.i18n.gettext('Record saved successfully.'));
            resolve(res);
          })
          .catch(res => {
            if ((res.status === 500) && res.responseText)
              alert(res.responseText);
            else
              Katrid.Dialogs.Alerts.error(Katrid.i18n.gettext('Error saving record changes'));
            reject(res);
          });
      });
    }

    groupBy(grouping) {
      return this.post('group_by', { kwargs: grouping });
    }

    autoReport() {
      return this.post('auto_report', { kwargs: {} });
    }

    rpc(meth, args, kwargs) {
      return this.post(meth, { args: args, kwargs: kwargs });
    }
  }


  class Query extends Model {
    constructor() {
      super('ir.query');
    }

    static read(id) {
      return (new Query()).post('read', { args: [id] });
    }
  }


  class Data extends Service {
    static get url() { return '/web/data/' };

    reorder(model, ids, field='sequence', offset=0) {
      return this.post('reorder', { args: [ model, ids, field, offset ] });
    }
  }

  class Attachments {
    static destroy(id) {
      let svc = new Model('ir.attachment');
      svc.destroy(id);
    }

    static upload(file, scope=null) {
      let data = new FormData();
      if (scope === null) scope = angular.element(file).scope();
      data.append('model', scope.model.name);
      data.append('id', scope.recordId);
      for (let f of file.files) data.append('attachment', f, f.name);
      return $.ajax({
        url: '/web/content/upload/',
        type: 'POST',
        data: data,
        processData: false,
        contentType: false
      })
      .done((res) => {
        console.log('attachments', scope.attachments, scope);
        if (!scope.attachments)
          scope.attachments = [];
        if (res)
          for (let obj of res) scope.attachments.push(obj);
        scope.$apply();
      });
    }
  }

  class View extends Model {
    constructor() {
      super('ui.view');
    }

    fromModel(model) {
      return this.post('from_model', null, {model});
    }
  }


  class Actions extends Model {
    static load(action) {
      let svc = new Model('ir.action');
      return svc.post('load', { args: [action] });
    }
  }


  class Auth extends Service {
    static login(username, password) {
      return this._post('/web/login/', { username: username, password: password });
    }
  }


  this.Katrid.Services = {
    Data,
    View,
    data: new Data('', ),
    Attachments,
    Service,
    Model,
    Query,
    Auth,
    Actions
  };

})();

(function () {

  class Application {
    static initClass() {
      this.auth = {
        user: {},
        isAuthenticated: false,
        logout(next) {
          return console.log(next);
        }
      };
    }

    constructor(title) {
      this.title = title;
    }


    static get context() {
      if (Katrid.Actions.actionManager.mainAction)
        return Katrid.Actions.actionManager.mainAction.getContext();
    }
  }
  Application.initClass();


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


  const _isMobile = function isMobile() {
    var check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
    return check;
  }();

  Katrid.Settings = {
    additionalModules: [],
    server: '',
    servicesProtocol: (typeof io !== 'undefined' && io !== null) && io.connect ? 'io' : 'http',

    // Katrid Framework UI Settings
    UI: {
      isMobile: _isMobile,
      dateInputMask: true,
      defaultView: 'list',
      goToDefaultViewAfterCancelInsert: true,
      goToDefaultViewAfterCancelEdit: false,
      horizontalForms: true
    },

    Services: {
      choicesPageLimit: 10
    },

    Speech: {
      enabled: false
    }
  };

  Katrid.LocalSettings = LocalSettings;

  if (Katrid.Settings.servicesProtocol === 'io') {
    Katrid.socketio = io.connect(`//${document.domain}:${location.port}/rpc`);
  }


  Katrid.Application = Application;

}).call(this);
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

}).call(this);

(function() {

  class Field {
    constructor(info) {
      this._info = info;
      this.displayChoices = _.object(info.choices);
    }

    static fromInfo(info) {
      let cls = Katrid.Data.Fields[info.type] || StringField;
      return new cls(info);
    }

    static fromArray(fields) {
      let r = {};
      Object.keys(fields).map(k => r[k] = this.fromInfo(fields[k]));
      return r;
    }

    fromJSON(value, dataSource) {
      dataSource.record[this.name] = value;
    }

    get onChange() {
      return this._info.onchange;
    }

    get hasChoices() {
      return this._info.choices && this._info.choices.length > 0;
    }

    get choices() {
      return this._info.choices;
    }

    get name() {
      return this._info.name;
    }

    get model() {
      return this._info.model;
    }

    get caption() {
      return this._info.caption;
    }

    get readonly() {
      return this._info.readonly;
    }

    get maxLength() {
      return this._info.max_length;
    }

    get type() {
      return this._info.type;
    }

    get paramTemplate() {
      return 'view.param.String';
    }

    format(value) {
      return value.toString();
    }

    toJSON(val) {
      return val;
    }

    createWidget(widget, scope, attrs, element) {
      if (!widget) {
        // special fields case
        if (this.name === 'status')
          widget = 'StatusField';
        else if (this.hasChoices)
          widget = 'SelectionField';
      }
      let cls = Katrid.UI.Widgets[widget || this.type] || Katrid.UI.Widgets.StringField;
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

  class StringField extends Field {
  }

  class BooleanField extends Field {
    get paramTemplate() {
      return 'view.param.Boolean';
    }
  }

  class DateField extends Field {
    toJSON(val) {
      return val;
    }

    get paramTemplate() {
      return 'view.param.Date';
    }

    format(value) {
      if (_.isString(value))
        return moment(value).format(Katrid.i18n.gettext('yyyy-mm-dd').toUpperCase());
      return '';
    }
  }

  class DateTimeField extends DateField {
    get paramTemplate() {
      return 'view.param.DateTime';
    }
  }

  class NumericField extends Field {
    toJSON(val) {
      if (val && _.isString(val))
        return parseFloat(val);
      return val;
    }
  }

  class IntegerField extends Field {
    toJSON(val) {
      if (val && _.isString(val))
        return parseInt(val);
      return val;
    }

    get paramTemplate() {
      return 'view.param.Integer';
    }
  }

  class FloatField extends NumericField {
  }

  class DecimalField extends NumericField {
  }

  class ForeignKey extends Field {
    toJSON(val) {
      if (_.isArray(val))
        return val[0];
      return val;
    }
  }

  class OneToManyField extends Field {
    get field() {
      return this._info.field;
    }

    fromJSON(val, dataSource) {
      if (val && val instanceof Array) {
        val.map((obj) => {
          if (obj.action === 'CREATE') {
            let child = dataSource.childByName(this.name);
            child.scope.addRecord(obj.values);
          }
        });
      }
    }
  }

  class ManyToManyField extends ForeignKey {
    toJSON(val) {
      if (_.isArray(val))
        return val.map(obj => _.isArray(obj) ? obj[0] : obj);
      else if (_.isString(val))
        val = val.split(',');
      return val;
    }
  }

  Katrid.Data.Fields = {
    Field,
    StringField,
    IntegerField,
    FloatField,
    DecimalField,
    DateTimeField,
    ForeignKey,
    OneToManyField,
    ManyToManyField,
    DateField,
    BooleanField,
  }


})();
(function () {

  class Import extends Katrid.UI.Views.View {
    constructor(scope) {
      super(scope);
      this.templateUrl = 'view.import';
    }
  }

  Katrid.Actions.ClientAction.register('import', Import);

}).call(this);

(function () {

  class DataSourceState {
    static initClass() {
      this.inserting = 'inserting';
      this.browsing = 'browsing';
      this.editing = 'editing';
      this.loading = 'loading';
      this.inactive = 'inactive';
    }
  }
  DataSourceState.initClass();

  DEFAULT_REQUEST_INTERVAL = 300;

  class DataSource {
    constructor(scope) {
      this.readonly = false;
      this.$modifiedRecords = [];
      // this.onFieldChange = this.onFieldChange.bind(this);
      this.scope = scope;
      this.action = scope.action;
      this._recordIndex = 0;
      this.recordCount = null;
      this.loading = false;
      this.loadingRecord = false;
      this._masterSource = null;
      this.pageIndex = 0;
      this.pageLimit = 100;
      this.offset = 0;
      this.offsetLimit = 0;
      this.requestInterval = DEFAULT_REQUEST_INTERVAL;
      this.pendingRequest = null;
      this.fieldName = null;
      this.children = [];
      this.modifiedData = null;
      this.uploading = 0;
      this._state = null;
      this.fieldWatchers = [];
      this._pendingChanges = false;
    }

    addFieldWatcher(field) {

    }

    get fields() {
      return this.scope.view.fields;
    }

    get loadingAction() {
      return this._loadingAction;
    }

    set loadingAction(v) {
      if (v) this.requestInterval = 0;
      else this.requestInterval = DEFAULT_REQUEST_INTERVAL;
      this._loadingAction = v;
    }

    async cancel() {
      if (!this.changing)
        return;

      for (let child of this.children)
        child.cancel();

      this._recordIndex = null;
      this._pendingChanges = false;

      if ((this.state === DataSourceState.inserting) && Katrid.Settings.UI.goToDefaultViewAfterCancelInsert) {
        this.record = {};
        this.scope.action.setViewType('list');
      } else {
        if (this.state === DataSourceState.editing) {
          if (this.scope.record) {
            let r = await this.refresh([this.scope.record.id]);
            this.state = DataSourceState.browsing;
            this.recordId = this.record.id;
          }
        } else {
          this.record = {};
          this.state = DataSourceState.browsing;
        }
      }
    }

    saveAndClose() {
      // Save changes and close dialog
      const r = this.saveChanges(false);
      if (r && $.isFunction(r.promise)) {
        return r.then(res => {
          if (res.ok && res.result)
            this.scope.result = res.result;

          return $(this.scope.root).closest('.modal').modal('toggle');
        });
      }
    }


    async copy(id) {
      let res = await this.model.copy(id);
      this.record = {};
      this.state = DataSourceState.inserting;
      this.setValues(res);
      this.scope.$apply();
      return res;
    }

    findById(id) {
      for (let rec of this.scope.records)
        if (rec.id === id)
          return rec;
      return null;
    }

    hasKey(id) {
      return this.findById(id) !== null;
    }

    refresh(data) {
      let r;
      if (data) {
        // Refresh current record
        r = this.get(data[0]);
      } else if (this.scope.record.id) {
        r = this.get(this.scope.record.id);
      } else {
        r = this.search(this._params, this._page);
      }
      r.then(() => {
        for (let child in this.children)
          if (child.invalidate) {
            child.invalidate(this.recordId);
            child.scope.$apply();
          }
      });
      return r;
    }

    _validateForm(elForm, form, errorMsgs) {
      let elfield;
      console.log(form.$error);
      for (let errorType in form.$error)
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

      return elfield;
    }

    validate() {
      if (this.scope.form.$invalid) {
        let elfield;
        let errors = [];
        let s = `<span>${Katrid.i18n.gettext('The following fields are invalid:')}</span><hr>`;
        const el = this.scope.formElement;
        elfield = this._validateForm(el, this.scope.form, errors);
        Katrid.uiKatrid.setFocus(elfield);
        s += errors.join('');
        Katrid.Dialogs.Alerts.error(s);
        return false;
      }
      return true;
    }

    indexOf(obj) {
      return this.scope.records.indexOf(this.findById(obj.id));
    }

    search(params, page, fields, timeout) {
      let master = this.masterSource;
      if (this.groups && !this.groups.length && this.scope.defaultGrouping) {
        let g = {
          context: {
            grouping: [this.scope.defaultGrouping]
          }
        };
        this.groupBy(g);
        return;
      }
      this._params = params;
      this._page = page;
      this._clearTimeout();
      this.pendingRequest = true;
      this.loading = true;
      page = page || 1;
      this.pageIndex = page;
      let { domain } = this.scope.action.info;
      if (domain) {
        domain = JSON.parse(domain);
      }
      params = {
        count: true,
        page,
        params,
        fields,
        domain,
        limit: this.limit
      };

      return new Promise(
        (resolve, reject) => {

          let req = () => {
            this.model.search(params)
            .catch(res => {
              return reject(res);
            })
            .then(res => {
              if (this.pageIndex > 1) {
                this.offset = ((this.pageIndex - 1) * this.pageLimit) + 1;
              } else {
                this.offset = 1;
              }
              this.scope.$apply(() => {
                if (res.count != null)
                  this.recordCount = res.count;

                let data = res.data;
                if (this.readonly)
                  this.scope.records = data;
                else
                  this.scope.records = data.map((obj) => Katrid.Data.createRecord(obj, this));
                if (this.pageIndex === 1) {
                  return this.offsetLimit = this.scope.records.length;
                } else {
                  return this.offsetLimit = (this.offset + this.scope.records.length) - 1;
                }
              });
              return resolve(res);
            })
            .finally(() => {
              this.pendingRequest = false;
              this.scope.$apply(() => {
                this.loading = false;
              });
            });
          };

          if (((this.requestInterval > 0) || timeout) && (timeout !== false))
            this.pendingRequest = setTimeout(req, this.requestInterval);
          else req();
        }
      );
    }

    groupBy(group) {
      if (!group) {
        this.groups = [];
        return;
      }
      this.scope.groupings = [];
      this.groups = [group];
      return this.model.groupBy(group.context)
      .then(res => {
        this.scope.records = [];
        const groupName = group.context.grouping[0];
        for (let r of Array.from(res)) {
          let s = r[groupName];
          if ($.isArray(s)) {
            r._paramValue = s[0];
            s = s[1];
          } else {
            r._paramValue = s;
          }
          r.__str__ = s;
          r.expanded = false;
          r.collapsed = true;
          r._searchGroup = group;
          r._paramName = groupName;
          r._domain = {};
          r._domain[r._paramName] = r._paramValue;
          const row = {_group: r, _hasGroup: true};

          // load groupings info
          let grouping = r;
          this.scope.groupings.push(grouping);

          // auto load records
          if (this.autoLoadGrouping) {
            ((grouping) => {
            this.model.search({params: r._domain})
            .then(res => {
              if (res.ok) this.scope.$apply(() => {grouping.records = res.result.data});
            })})(grouping);
          }

          this.scope.records.push(row);
        }
        return this.scope.$apply();
      });
    }

    goto(index) {
      return this.recordIndex = index;
    }

    moveBy(index) {
      const newIndex = (this._recordIndex + index);
      if ((newIndex > -1) && (newIndex < this.scope.records.length))
        this.recordIndex = newIndex;
    }

    _clearTimeout() {
      this.loading = false;
      this.loadingRecord = false;
      this._canceled = true;
      clearTimeout(this.pendingRequest);
    }

    set masterSource(master) {
      this._masterSource = master;
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
          const v = data[attr];
          obj[attr] = v;
          //record[attr] = v;
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
                res.push({id: rec.id, action: 'DESTROY'})
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

    save(autoRefresh=true) {
      // Submit fields with dirty state only
      console.log('SUBMIT', this.record.$record.toObject());

      // Save pending children
      for (let child of this.children)
        if (child.changing)
          child.scope.save();

      const el = this.scope.formElement;
      if (this.validate()) {
        const data = this.record.$record.toObject();
        // const data = this.getModifiedData(this.scope.form, el, this.scope.record);
        this.scope.form.data = data;

        let beforeSubmit = el.attr('before-submit');
        if (beforeSubmit)
          beforeSubmit = this.scope.$eval(beforeSubmit);

        //@scope.form.data = null

        if (data) {
          this.uploading++;
          return this.model.write([data])
          .then(res => {
            // this._clearCache();
            this.scope.action.location.search('id', res[0]);
            this.scope.form.$setPristine();
            this.scope.form.$setUntouched();
            this._pendingChanges = false;
            this.state = DataSourceState.browsing;
            if (autoRefresh)
              return this.refresh(res);

          })
          .catch(error => {
            let s = `<span>${Katrid.i18n.gettext('The following fields are invalid:')}<hr></span>`;
            if (error.message)
              s = error.message;
            else if (error.messages) {
              let elfield;
              for (let fld of Object.keys(error.messages)) {
                const msgs = error.messages[fld];
                let field;
                // check qualified field name
                if (fld.indexOf('.') > -1) {
                  fld = fld.split('.');
                  let subField = fld[1];
                  for (let child of this.children)
                    if (child.scope.fieldName === fld[0]) {
                      field = child.scope.view.fields[subField];
                    }
                } else
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

            return Katrid.Dialogs.Alerts.error(s);

          })
          .finally(() => this.scope.$apply(() => this.uploading-- ) );
        } else
          Katrid.Dialogs.Alerts.warn(Katrid.i18n.gettext('No pending changes'));
      }
    }

    _getNested(recs) {
      let res = [];
      if (recs.$deleted && recs.$deleted.recs.length)
        for (let rec of recs.$deleted.recs)
          res.push({id: rec.id, action: 'DESTROY'});

      let vals;
      if (recs.recs.length)
        for (let rec of recs.recs) if (rec) {
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
          } else
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

    get(id, timeout, apply=true, index=false) {
      this._clearTimeout();
      this.state = DataSourceState.loading;
      this.loadingRecord = true;
      this._canceled = false;

      return new Promise(
        (resolve, reject) => {
          const _get = () => {
            return this.model.getById(id)
            .catch(res => {
              return reject(res);
            })
            .then(res => {
              if (this._canceled || !res)
                return;
              if (this.state === DataSourceState.loading)
                this.state = DataSourceState.browsing;
              else if (this.state === DataSourceState.inserting)
                return;
              this.record = res.data[0];
              if (apply)
                this.scope.$apply();
              if (index !== false)
                this.scope.records[index] = this.record;
              return resolve(this.record);
            })
            .finally(() => {
              return this.scope.$apply(() => {
                return this.loadingRecord = false;
              });
            });
          };
          if (!timeout && !this.requestInterval)
            return _get();
          else
            this.pendingRequest = setTimeout(_get, timeout || this.requestInterval);

        }
      );
    }

    insert() {
      this._clearTimeout();
      for (let child of this.children)
        child._clearTimeout();
      let rec = {};
      rec.$created = true;
      this.record = rec;
      return this.model.getDefaults()
      .then(res => {
        this.scope.$apply(() => {
          for (let child of this.children)
            child.scope.records = [];

          this.state = DataSourceState.inserting;
          this.scope.record.display_name = Katrid.i18n.gettext('(New)');
          if (res.result)
            this.setValues(res.result);

        });
      });
    }

    _new() {
      return Katrid.Data.createRecord({}, this);
    }

    setValues(values) {
      Object.entries(values).forEach(([k, v]) => {
        let fld = this.action.view.fields[k];
        if (fld)
          fld.fromJSON(v, this);
        else
          this.scope.record[k] = v
      });
      for (let child of this.children)
        child.scope.$apply();
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
      return this.scope.view.fields[fieldName];
    }

    set state(state) {
      // Clear modified fields information
      this._modifiedFields = [];
      this._state = state;
      this.inserting = state === DataSourceState.inserting;
      this.editing = state === DataSourceState.editing;
      this.loading = state === DataSourceState.loading;
      this.changing =  [DataSourceState.editing, DataSourceState.inserting].includes(this.state);
      if (this.changing)
        setTimeout(() => {
          if (this.action.$element)
            for (let el of Array.from(this.action.$element.find("input[type!=hidden].form-field:visible"))) {
              el = $(el);
              if (!el.attr('readonly')) {
                $(el).focus();
                return;
              }
            }
        });
    }

    get browsing() {
      return this._state === DataSourceState.browsing;
    }

    childByName(fieldName) {
      for (let child of this.children) {
        if (child.fieldName === fieldName)
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
      // refresh record id
      this.scope.recordId = value;
      // refresh children
      for (let child of this.children)
        child.scope.masterChanged(value);
    }

    get recordId() {
      return this.scope.recordId;
    }

    set record(rec) {
      // Track field changes
      this.scope.record = Katrid.Data.createRecord(rec, this);
      this.recordId = rec.id;
      this._pendingChanges = false;
      if (this.scope.form)
        this.scope.form.$setPristine();
      // this.state = DataSourceState.browsing;
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
        return this.scope.action.location.search('page', this.pageIndex + 1);
      }
    }

    prevPage() {
      if (this.pageIndex > 1) {
        return this.scope.action.location.search('page', this.pageIndex - 1);
      }
    }

    set recordIndex(index) {
      this._recordIndex = index;
      if (!this.masterSource)
        return this.action.location.search('id', this.scope.records[index].id);
      this.scope.record = this.scope.records[index];
      // load record
      this.scope.recordId = null;
      // set new id on browser address
    }

    get recordIndex() {
      return this._recordIndex;
    }

    expandGroup(index, row) {
      const rg = row._group;
      const params =
        {params: {}};
      params.params[rg._paramName] = rg._paramValue;
      return this.model.search(params)
      .then(res => {
        if (res.ok && res.result.data) {
          return this.action.scope.$apply(() => {
            rg._children = res.result.data;
            return this.action.scope.records.splice.apply(this.scope.records, [index + 1, 0].concat(res.result.data));
          });
        }
      });
    }

    collapseGroup(index, row) {
      const group = row._group;
      this.scope.records.splice(index + 1, group._children.length);
      return delete group._children;
    }
    
    _applyResponse(res) {
      if (res.value)
        this.setValues(res.value);
      this.scope.$apply();
    }

    dispatchEvent(name, ...args) {
      this.model.rpc(name, ...args)
      .then(res => this._applyResponse(res));
    }

    get model() {
      return this.scope.model;
    }

    get parent() {
      return this.masterSource;
    }

    $setDirty(field) {
      this.scope.$setDirty(field);
    }
  }


  Katrid.Data = {
    DataSource,
    DataSourceState
  };

})();

(function() {

  class Record {
    constructor(data, dataSource, state) {
      this.raw = data;
      this.data = {};
      this.old = jQuery.extend({}, data);
      this.dataSource = dataSource;
      this.pending = null;
      this.modified = false;
      this.children = [];
      this.state = state;
      this.submitted = false;
      data.$record = this;
    }

    get scope() {
      return this.dataSource.scope;
    }

    get pk() {
      return this.raw.id;
    }

    $delete() {
      this.state = RecordState.destroyed;
      if (this.pk)
        this.setModified();
      else if (this.parent.children.indexOf(this) > -1)
        this.parent.children.splice(this.parent.children.indexOf(this), 1);
    }

    _prepareRecord(rec) {
      let res = {};
      Object.entries(rec).map(obj => {
        if (!obj[0].startsWith('$'))
          res[obj[0]] = obj[1]
      });
      return res;
    }

    setModified(field) {
      if (!this.modified && (this.state !== RecordState.destroyed)) {
        if (this.pk)
          this.state = RecordState.modified;
        else
          this.state = RecordState.created;
      }
      if (field)
        this.dataSource.$setDirty(field);
      this.dataSource._pendingChanges = true;
      this.modified = true;

      if (this.parent && this.scope.fieldName) {
        this.parent.setModified(this.scope.fieldName);
        this.parent.addChild(this);
      }
    }

    get parent() {
      return this.dataSource.parent && this.dataSource.parent.record.$record;
    }

    addChild(child) {
      this.setModified(child.scope.fieldName);
      if (this.children.indexOf(child) === -1) {
        this.children.push(child);
      }
    }

    compare(oldValue, newValue) {
      if (_.isArray(oldValue) && _.isArray(newValue))
        return oldValue.join(',') !== newValue.join(',');
      return oldValue != newValue;
    }

    set(propKey, value) {
      let field = this.dataSource.fieldByName(propKey);
      if (field) {
        let oldValue = this.raw[propKey];
        value = field.toJSON(value);
        // check if field value has been changed
        if (this.compare(oldValue, value)) {
          this.setModified(propKey);
          this.data[propKey] = value;
          this.modified = true;
          // send field change event
          if (field.onChange) {
            let rec = this._prepareRecord(this.raw);
            rec[propKey] = value;
            this.dataSource.dispatchEvent('field_change_event', [propKey, rec]);
          }
        }
      }
      return true;
    }

    $new() {
      return Record(this.raw);
    }

    toObject() {
      let data = jQuery.extend({}, this.data);
      if (this.pk)
        data.id = this.pk;
      for (let child of this.children) {
        if (!(child.scope.fieldName in data))
          data[child.scope.fieldName] = [];
        if (child.state === RecordState.created)
          data[child.scope.fieldName].push({ action: 'CREATE', values: child.toObject() });
        else if (child.state === RecordState.modified)
          data[child.scope.fieldName].push({ action: 'UPDATE', values: child.toObject() });
        else if (child.state === RecordState.destroyed)
          data[child.scope.fieldName].push({ action: 'DESTROY', id: child.pk });
      }
      return data;
    }
  }

  class SubRecords {
    constructor(recs) {
      this.recs = recs;
    }

    append(rec) {
      if (this.recs.indexOf(rec) === -1)
        this.recs.push(rec);
    }
  }


  function createRecord(rec, dataSource) {
    new Record(rec, dataSource);
    return new Proxy(rec, {
      set(target, propKey, value, receiver) {
        let scope = dataSource.scope;
        if (!propKey.startsWith('$$')) {
          if (!propKey.startsWith('$') && scope) {
            rec.$record.set(propKey, value);
            // if (fld instanceof Katrid.Data.Fields.OneToManyField) {
            //   if (!rec.$modifiedData[propKey]) {
            //     rec.$modifiedData[propKey] = new SubRecords(value);
            //     rec.$modifiedData[propKey].$deleted = new SubRecords([]);
            //   } else
            //     rec.$modifiedData[propKey].recs = value;
            //
            //   return Reflect.set(target, propKey, value, receiver);
            // }
          }
        }
        return Reflect.set(target, propKey, value, receiver);
      }
    })
  }

  class RecordState {
    static initClass() {
      this.destroyed = 'destroyed';
      this.created = 'created';
      this.modified = 'modified';
    }
  }
  RecordState.initClass();

  Katrid.Data.RecordState = RecordState;
  Katrid.Data.createRecord = createRecord;
  Katrid.Data.SubRecords = SubRecords;

})();
(function () {

  class View {
    constructor(info) {
      this._info = info;
      this.fields = info.fields;
      this.content = info.content;
      this.toolbar = info.toolbar;
    }
  }

  Katrid.Data.View = View;
})();
(function($){"use strict";if(!$.browser){$.browser={};$.browser.mozilla=/mozilla/.test(navigator.userAgent.toLowerCase())&&!/webkit/.test(navigator.userAgent.toLowerCase());$.browser.webkit=/webkit/.test(navigator.userAgent.toLowerCase());$.browser.opera=/opera/.test(navigator.userAgent.toLowerCase());$.browser.msie=/msie/.test(navigator.userAgent.toLowerCase())}var methods={destroy:function(){$(this).unbind(".maskMoney");if($.browser.msie){this.onpaste=null}return this},mask:function(value){return this.each(function(){var $this=$(this),decimalSize;if(typeof value==="number"){$this.trigger("mask");decimalSize=$($this.val().split(/\D/)).last()[0].length;value=value.toFixed(decimalSize);$this.val(value)}return $this.trigger("mask")})},unmasked:function(){return this.map(function(){var value=$(this).val()||"0",isNegative=value.indexOf("-")!==-1,decimalPart;$(value.split(/\D/).reverse()).each(function(index,element){if(element){decimalPart=element;return false}});value=value.replace(/\D/g,"");value=value.replace(new RegExp(decimalPart+"$"),"."+decimalPart);if(isNegative){value="-"+value}return parseFloat(value)})},init:function(settings){settings=$.extend({prefix:"",suffix:"",affixesStay:true,thousands:",",decimal:".",precision:2,allowZero:false,allowNegative:false},settings);return this.each(function(){var $input=$(this),onFocusValue;settings=$.extend(settings,$input.data());function getInputSelection(){var el=$input.get(0),start=0,end=0,normalizedValue,range,textInputRange,len,endRange;if(typeof el.selectionStart==="number"&&typeof el.selectionEnd==="number"){start=el.selectionStart;end=el.selectionEnd}else{range=document.selection.createRange();if(range&&range.parentElement()===el){len=el.value.length;normalizedValue=el.value.replace(/\r\n/g,"\n");textInputRange=el.createTextRange();textInputRange.moveToBookmark(range.getBookmark());endRange=el.createTextRange();endRange.collapse(false);if(textInputRange.compareEndPoints("StartToEnd",endRange)>-1){start=end=len}else{start=-textInputRange.moveStart("character",-len);start+=normalizedValue.slice(0,start).split("\n").length-1;if(textInputRange.compareEndPoints("EndToEnd",endRange)>-1){end=len}else{end=-textInputRange.moveEnd("character",-len);end+=normalizedValue.slice(0,end).split("\n").length-1}}}}return{start:start,end:end}}function canInputMoreNumbers(){var haventReachedMaxLength=!($input.val().length>=$input.attr("maxlength")&&$input.attr("maxlength")>=0),selection=getInputSelection(),start=selection.start,end=selection.end,haveNumberSelected=selection.start!==selection.end&&$input.val().substring(start,end).match(/\d/)?true:false,startWithZero=$input.val().substring(0,1)==="0";return haventReachedMaxLength||haveNumberSelected||startWithZero}function setCursorPosition(pos){$input.each(function(index,elem){if(elem.setSelectionRange){elem.focus();elem.setSelectionRange(pos,pos)}else if(elem.createTextRange){var range=elem.createTextRange();range.collapse(true);range.moveEnd("character",pos);range.moveStart("character",pos);range.select()}})}function setSymbol(value){var operator="";if(value.indexOf("-")>-1){value=value.replace("-","");operator="-"}return operator+settings.prefix+value+settings.suffix}function maskValue(value){var negative=value.indexOf("-")>-1&&settings.allowNegative?"-":"",onlyNumbers=value.replace(/[^0-9]/g,""),integerPart=onlyNumbers.slice(0,onlyNumbers.length-settings.precision),newValue,decimalPart,leadingZeros;integerPart=integerPart.replace(/^0*/g,"");integerPart=integerPart.replace(/\B(?=(\d{3})+(?!\d))/g,settings.thousands);if(integerPart===""){integerPart="0"}newValue=negative+integerPart;if(settings.precision>0){decimalPart=onlyNumbers.slice(onlyNumbers.length-settings.precision);leadingZeros=new Array(settings.precision+1-decimalPart.length).join(0);newValue+=settings.decimal+leadingZeros+decimalPart}return setSymbol(newValue)}function maskAndPosition(startPos){var originalLen=$input.val().length,newLen;$input.val(maskValue($input.val()));newLen=$input.val().length;startPos=startPos-(originalLen-newLen);setCursorPosition(startPos)}function mask(){var value=$input.val();if(value)$input.val(maskValue(value))}function changeSign(){var inputValue=$input.val();if(settings.allowNegative){if(inputValue!==""&&inputValue.charAt(0)==="-"){return inputValue.replace("-","")}else{return"-"+inputValue}}else{return inputValue}}function preventDefault(e){if(e.preventDefault){e.preventDefault()}else{e.returnValue=false}}function keypressEvent(e){e=e||window.event;var key=e.which||e.charCode||e.keyCode,keyPressedChar,selection,startPos,endPos,value;if(key===undefined){return false}if(key<48||key>57){if(key===45){$input.val(changeSign());return false}else if(key===43){$input.val($input.val().replace("-",""));return false}else if(key===13||key===9){return true}else if($.browser.mozilla&&(key===37||key===39)&&e.charCode===0){return true}else{preventDefault(e);return true}}else if(!canInputMoreNumbers()){return false}else{preventDefault(e);keyPressedChar=String.fromCharCode(key);selection=getInputSelection();startPos=selection.start;endPos=selection.end;value=$input.val();$input.val(value.substring(0,startPos)+keyPressedChar+value.substring(endPos,value.length));maskAndPosition(startPos+1);return false}}function keydownEvent(e){e=e||window.event;var key=e.which||e.charCode||e.keyCode,selection,startPos,endPos,value,lastNumber;if(key===undefined){return false}selection=getInputSelection();startPos=selection.start;endPos=selection.end;if(key===8||key===46||key===63272){preventDefault(e);value=$input.val();if(startPos===endPos){if(key===8){if(settings.suffix===""){startPos-=1}else{lastNumber=value.split("").reverse().join("").search(/\d/);startPos=value.length-lastNumber-1;endPos=startPos+1}}else{endPos+=1}}$input.val(value.substring(0,startPos)+value.substring(endPos,value.length));if((key===Katrid.UI.Keyboard.keyCode.DELETE||key===Katrid.UI.Keyboard.keyCode.BACKSPACE)&&!$input.val())return false;maskAndPosition(startPos);return false}else if(key===9){return true}else{return true}}function focusEvent(){onFocusValue=$input.val();mask();var input=$input.get(0),textRange;if(input.createTextRange){textRange=input.createTextRange();textRange.collapse(false);textRange.select()}}function cutPasteEvent(){setTimeout(function(){mask()},0)}function getDefaultMask(){var n=parseFloat("0")/Math.pow(10,settings.precision);return n.toFixed(settings.precision).replace(new RegExp("\\.","g"),settings.decimal)}function blurEvent(e){if($.browser.msie){keypressEvent(e)}if($input.val()==="")return;if($input.val()===setSymbol(getDefaultMask())){if(!settings.allowZero){$input.val("")}else if(!settings.affixesStay){$input.val(getDefaultMask())}else{$input.val(setSymbol(getDefaultMask()))}}else{if(!settings.affixesStay){var newValue=$input.val().replace(settings.prefix,"").replace(settings.suffix,"");$input.val(newValue)}}if($input.val()!==onFocusValue){$input.change()}}function clickEvent(){let input=$input.get(0),length;if(input.setSelectionRange){input.select();return;length=$input.val().length;input.setSelectionRange(length,length)}else{$input.val($input.val())}}$input.unbind(".maskMoney");$input.bind("keypress.maskMoney",keypressEvent);$input.bind("keydown.maskMoney",keydownEvent);$input.bind("blur.maskMoney",blurEvent);$input.bind("focus.maskMoney",focusEvent);$input.bind("click.maskMoney",clickEvent);$input.bind("cut.maskMoney",cutPasteEvent);$input.bind("paste.maskMoney",cutPasteEvent);$input.bind("mask.maskMoney",mask)})}};$.fn.maskMoney=function(method){if(methods[method]){return methods[method].apply(this,Array.prototype.slice.call(arguments,1))}else if(typeof method==="object"||!method){return methods.init.apply(this,arguments)}else{$.error("Method "+method+" does not exist on jQuery.maskMoney")}}})(window.jQuery||window.Zepto);(function(){const globals=this;this.Katrid={ready(fn){const script=$("script").first();return fn(angular.element($(script).parent()).scope())},bootstrap(){this.localSettings=new this.LocalSettings},i18n:{languageCode:"pt-BR",formats:{},catalog:{},initialize(plural,catalog,formats){Katrid.i18n.plural=plural;Katrid.i18n.catalog=catalog;Katrid.i18n.formats=formats;if(plural){Katrid.i18n.pluralidx=function(n){if(plural instanceof boolean){if(plural){return 1}else{return 0}}else{return plural}}}else{Katrid.i18n.pluralidx=function(n){if(count===1){return 0}else{return 1}}}globals.pluralidx=Katrid.i18n.pluralidx;globals.gettext=Katrid.i18n.gettext;globals.ngettext=Katrid.i18n.ngettext;globals.gettext_noop=Katrid.i18n.gettext_noop;globals.pgettext=Katrid.i18n.pgettext;globals.npgettext=Katrid.i18n.npgettext;globals.interpolate=Katrid.i18n.interpolate;globals.get_format=Katrid.i18n.get_format;_.mixin({gettext:Katrid.i18n.gettext,sprintf:sprintf});return Katrid.i18n.initialized=true},merge(catalog){return Array.from(catalog).map(key=>Katrid.i18n.catalog[key]=catalog[key])},gettext(s){const value=Katrid.i18n.catalog[s];if(value!=null){return value}else{return s}},gettext_noop(s){return s},ngettext(singular,plural,count){const value=Katrid.i18n.catalog[singular];if(value!=null){return value[Katrid.i18n.pluralidx(count)]}else if(count===1){return singular}else{return plural}},pgettext(s){let value=Katrid.i18n.gettext(s);if(value.indexOf("")!==-1){value=s}return value},npgettext(ctx,singular,plural,count){let value=Katrid.i18n.ngettext(ctx+""+singular,ctx+""+plural,count);if(value.indexOf("")!==-1){value=Katrid.i18n.ngettext(singular,plural,count)}return value},interpolate(fmt,obj,named){if(named){fmt.replace(/%\(\w+\)s/g,match=>String(obj[match.slice(2,-2)]))}else{fmt.replace(/%s/g,match=>String(obj.shift()))}return{get_format(formatType){const value=Katrid.i18n.formats[formatType];if(value!=null){return value}else{return formatType}}}}}};Katrid.core={}}).call(this);(function(){class Application{static initClass(){this.auth={user:{},isAuthenticated:false,logout(next){return console.log(next)}}}constructor(title){this.title=title}static get context(){if(Katrid.Actions.actionManager.mainAction)return Katrid.Actions.actionManager.mainAction.getContext()}}Application.initClass();class LocalSettings{static init(){Katrid.localSettings=new LocalSettings}constructor(){}get searchMenuVisible(){return parseInt(localStorage.searchMenuVisible)===1}set searchMenuVisible(value){localStorage.searchMenuVisible=value?1:0}}const _isMobile=function isMobile(){var check=false;(function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4)))check=true})(navigator.userAgent||navigator.vendor||window.opera);return check}();Katrid.Settings={additionalModules:[],server:"",servicesProtocol:typeof io!=="undefined"&&io!==null&&io.connect?"io":"http",UI:{isMobile:_isMobile,dateInputMask:true,defaultView:"list",goToDefaultViewAfterCancelInsert:true,goToDefaultViewAfterCancelEdit:false,horizontalForms:true},Services:{choicesPageLimit:10},Speech:{enabled:false}};Katrid.LocalSettings=LocalSettings;if(Katrid.Settings.servicesProtocol==="io"){Katrid.socketio=io.connect(`//${document.domain}:${location.port}/rpc`)}Katrid.Application=Application}).call(this);(function(){let requestManager;class RequestManager{constructor(){this.requestId=0;this.requests={}}request(){const reqId=++requestManager.requestId;const def=new $.Deferred;this.requests[reqId]=def;def.requestId=reqId;return def}}if(Katrid.socketio){requestManager=new RequestManager;Katrid.socketio.on("connect",()=>console.log("I'm connected!"));Katrid.socketio.on("api",function(data){if(_.isString(data)){data=JSON.parse(data)}const def=requestManager.requests[data["req-id"]];return def.resolve(data)})}class Service{static get url(){return"/api/rpc/"}constructor(name,scope){this.name=name}static _fetch(url,config,params){if(params){url=new URL(url);Object.entries(params).map((k,v)=>url.searchParams.append(k,v))}return fetch(url,config)}static _post(url,data,params){return this._fetch(url,{method:"POST",credentials:"same-origin",body:JSON.stringify(data),headers:{"content-type":"application/json"}},params).then(res=>res.json())}delete(name,params,data){}get(name,params){if(Katrid.Settings.servicesProtocol==="ws"){return Katrid.socketio.emit("api",{channel:"rpc",service:this.name,method:name,data:data,args:params})}else{const methName=this.name?this.name+"/":"";const rpcName=Katrid.Settings.server+this.constructor.url+methName+name+"/";return $.get(rpcName,params)}}post(name,data,params){let context=Katrid.Application.context;if(!data)data={};if(context)data.context=context;data={jsonrpc:"2.0",method:name,params:data,id:Math.floor(Math.random()*1e3*1e3*1e3)};if(Katrid.Settings.servicesProtocol==="io"){const def=requestManager.request();Katrid.socketio.emit("api",{"req-id":def.requestId,"req-method":"POST",service:this.name,method:name,data:data,args:params});return def}else{const methName=this.name?this.name+"/":"";let rpcName=Katrid.Settings.server+this.constructor.url+methName+name+"/";if(params){rpcName+=`?${$.param(params)}`}return new Promise((resolve,reject)=>{$.ajax({method:"POST",url:rpcName,data:JSON.stringify(data),contentType:"application/json; charset=utf-8",dataType:"json"}).then(res=>{if(res.error)reject(res.error);else resolve(res.result)}).fail(res=>reject(res))})}}}class Model extends Service{searchName(name){if(_.isString(name))name={args:name};return this.post("search_name",name)}createName(name){let kwargs={name:name};return this.post("create_name",{kwargs:kwargs})}search(data,params){return this.post("search",{kwargs:data},params)}destroy(id){if(!_.isArray(id))id=[id];return this.post("destroy",{kwargs:{ids:id}})}getById(id){return this.post("get",{args:[id]})}getDefaults(){return this.post("get_defaults",{})}copy(id){return this.post("copy",{args:[id]})}static _prepareFields(res){if(res){res.fields=Katrid.Data.Fields.Field.fromArray(res.fields);res.fieldList=Object.values(res.fields);Object.values(res.views).map(v=>v.fields=Katrid.Data.Fields.Field.fromArray(v.fields));Object.keys(res.views).map(k=>res.views[k]=new Katrid.Data.View(res.views[k]))}return res}getViewInfo(data){return this.post("get_view_info",{kwargs:data}).then(this.constructor._prepareFields)}async loadViews(data){return this.post("load_views",{kwargs:data}).then(this.constructor._prepareFields)}getFieldsInfo(data){return this.post("get_fields_info",{kwargs:data}).then(this.constructor._prepareFields)}getFieldChoices(field,term){return this.post("get_field_choices",{args:[field,term]})}doViewAction(data){return this.post("do_view_action",{kwargs:data})}write(data,params){return new Promise((resolve,reject)=>{this.post("write",{kwargs:{data:data}},params).then(res=>{Katrid.Dialogs.Alerts.success(Katrid.i18n.gettext("Record saved successfully."));resolve(res)}).catch(res=>{if(res.status===500&&res.responseText)alert(res.responseText);else Katrid.Dialogs.Alerts.error(Katrid.i18n.gettext("Error saving record changes"));reject(res)})})}groupBy(grouping){return this.post("group_by",{kwargs:grouping})}autoReport(){return this.post("auto_report",{kwargs:{}})}rpc(meth,args,kwargs){return this.post(meth,{args:args,kwargs:kwargs})}}class Query extends Model{constructor(){super("ir.query")}static read(id){return(new Query).post("read",{args:[id]})}}class Data extends Service{static get url(){return"/web/data/"}reorder(model,ids,field="sequence",offset=0){return this.post("reorder",{args:[model,ids,field,offset]})}}class Attachments{static destroy(id){let svc=new Model("ir.attachment");svc.destroy(id)}static upload(file,scope=null){let data=new FormData;if(scope===null)scope=angular.element(file).scope();data.append("model",scope.model.name);data.append("id",scope.recordId);for(let f of file.files)data.append("attachment",f,f.name);return $.ajax({url:"/web/content/upload/",type:"POST",data:data,processData:false,contentType:false}).done(res=>{console.log("attachments",scope.attachments,scope);if(!scope.attachments)scope.attachments=[];if(res)for(let obj of res)scope.attachments.push(obj);scope.$apply()})}}class View extends Model{constructor(){super("ui.view")}fromModel(model){return this.post("from_model",null,{model:model})}}class Actions extends Model{static load(action){let svc=new Model("ir.action");return svc.post("load",{args:[action]})}}class Auth extends Service{static login(username,password){return this._post("/web/login/",{username:username,password:password})}}this.Katrid.Services={Data:Data,View:View,data:new Data(""),Attachments:Attachments,Service:Service,Model:Model,Query:Query,Auth:Auth,Actions:Actions}})();(()=>{const uiKatrid=angular.module("ui.katrid",[]);Katrid.UI={Keyboard:{keyCode:{BACKSPACE:8,COMMA:188,DELETE:46,DOWN:40,END:35,ENTER:13,ESCAPE:27,HOME:36,LEFT:37,PAGE_DOWN:34,PAGE_UP:33,PERIOD:190,RIGHT:39,SPACE:32,TAB:9,UP:38}},toggleFullScreen(){if(!document.fullscreenElement&&!document.mozFullScreenElement&&!document.webkitFullscreenElement&&!document.msFullscreenElement){if(document.documentElement.requestFullscreen){document.documentElement.requestFullscreen()}else if(document.documentElement.msRequestFullscreen){document.documentElement.msRequestFullscreen()}else if(document.documentElement.mozRequestFullScreen){document.documentElement.mozRequestFullScreen()}else if(document.documentElement.webkitRequestFullscreen){document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT)}}else{if(document.exitFullscreen){document.exitFullscreen()}else if(document.msExitFullscreen){document.msExitFullscreen()}else if(document.mozCancelFullScreen){document.mozCancelFullScreen()}else if(document.webkitExitFullscreen){document.webkitExitFullscreen()}}}};Katrid.uiKatrid=uiKatrid})();(()=>{class Templates{static init(templateCache){Katrid.$templateCache=templateCache;let oldGet=templateCache.get;templateCache.get=function(name){return Templates.prepare(name,oldGet.call(this,name))};Templates.loadTemplates(templateCache)}static prepare(name,templ){if(_.isUndefined(templ))throw Error("Template not found: "+name);if(templ.tagName==="SCRIPT")return templ.innerHTML;return templ}static compileTemplate(base,templ){let el=$(base);templ=$(templ.innerHTML);for(let child of Array.from(templ))if(child.tagName==="JQUERY"){child=$(child);let sel=child.attr("selector");let op=child.attr("operation");if(sel)sel=$(el).find(sel);else sel=el;sel[op](child[0].innerHTML)}return el[0].innerHTML}static loadTemplates(templateCache){$.get("/web/client/templates/").done(res=>{let readTemplates=el=>{if(el.tagName==="TEMPLATES")Array.from(el.childNodes).map(readTemplates);else if(el.tagName==="SCRIPT"){let base=el.getAttribute("extends");let id=el.getAttribute("id")||base;if(base){el=Templates.compileTemplate(templateCache.get(base),el)}else id=el.id;templateCache.put(id,el)}};let parser=new DOMParser;let doc=parser.parseFromString(res,"text/html");readTemplates(doc.firstChild.childNodes[1].firstChild)})}}Katrid.UI.Templates=Templates})();(function(){class ActionManager extends Array{constructor(){super();this.mainAction=null}addAction(action){if(!this.mainAction)this.mainAction=action;this.push(action)}removeAction(action){this.actions.splice(this.actions.indexOf(action),this.actions.length)}get action(){return this[this.actions.length-1]}set action(action){this.splice(this.actions.indexOf(action)+1,this.actions.length)}clear(){this.length=0;this.mainAction=null}get path(){return this.action.path}}class Action{static initClass(){this.actionType=null}constructor(info,scope,location){Katrid.Actions.actionManager.addAction(this);this.info=info;this.scope=scope;this.location=location;this.currentUrl=this.location.$$path}getContext(){let ctx;if(_.isString(this.info.context))ctx=JSON.parse(this.info.context);if(!ctx)ctx={};return ctx}doAction(act){let type=act.type||act.action_type;return Katrid.Actions[type].dispatchAction(this,act)}openObject(service,id,evt){if(this._unregisterHook)this._unregisterHook();evt.preventDefault();evt.stopPropagation();if(evt.ctrlKey){window.open(evt.target.href);return false}const url=`action/${service}/view/`;this.location.path(url,this).search({view_type:"form",id:id});return false}restore(){}apply(){}backTo(index,viewType){if(this._currentPath!==this._unregisterHook&&Katrid.Actions.actionManager.length>1)this._unregisterHook();let action=Katrid.Actions.actionManager[index];if(index===0&&viewType===0)return action.restore(action.searchViewType||action.viewModes[0]);else if(index===0&&viewType==="form")return action.restore("form");Katrid.Actions.actionManager.action=action;if(!viewType)viewType="form";let location;location=action.currentUrl;action.info.__cached=true;let p=this.location.path(location,true,action.info);let search=action._currentParams[viewType];console.log("search",search);if(search)p.search(search)}execute(){}getCurrentTitle(){return this.info.display_name}search(){if(!this.isDialog){return this.location.search.apply(null,arguments)}}}Action.initClass();class WindowAction extends Action{static initClass(){this.actionType="ir.action.window"}constructor(info,scope,location){super(info,scope,location);this.notifyFields=[];this.viewMode=info.view_mode;this.viewModes=this.viewMode.split(",");this.selectionLength=0;this._cachedViews={};this._currentParams={};this._currentPath=null;this.searchView=null}getContext(){let ctx=super.getContext();let sel=this.selection;if(sel&&sel.length){ctx.active_id=sel[0];ctx.active_ids=sel}return ctx}restore(viewType){let url=this._currentPath||this.location.$$path;let params=this._currentParams[viewType]||{};params["view_type"]=viewType;if(Katrid.Actions.actionManager.length>1){console.log(this.info);params["actionId"]=this.info.id;this.$state.go("actionView",params)}else{this.setViewType(viewType)}}getCurrentTitle(){if(this.viewType==="form"){return this.scope.record.display_name}return super.getCurrentTitle()}createNew(){Katrid.Dialogs.WaitDialog.show();this.setViewType("form");setTimeout(()=>{this.dataSource.insert()},10)}deleteSelection(){let sel=this.selection;if(sel.length===1&&confirm(Katrid.i18n.gettext("Confirm delete record?"))||sel.length>1&&confirm(Katrid.i18n.gettext("Confirm delete records?"))){this.model.destroy(sel);const i=this.scope.records.indexOf(this.scope.record);this.setViewType("list");this.dataSource.refresh()}}copy(){this.setViewType("form");this.dataSource.copy(this.scope.record.id);return false}async routeUpdate(search){const viewType=this.viewType;let oldViewType=this._currentViewType;if(viewType!=null){if(this.scope.records==null){this.scope.records=[]}if(this.viewType!==oldViewType){console.log("change route",viewType);this.dataSource.pageIndex=null;this.dataSource.record={};this.viewType=viewType;this._currentViewType=this.viewType;this.setViewType(viewType,search)}if(Katrid.UI.Views.searchModes.includes(this.viewType)&&search.page!==this.dataSource.pageIndex){const filter=this.searchParams||{};const fields=Object.keys(this.view.fields);this.dataSource.pageIndex=parseInt(search.page);this.dataSource.limit=parseInt(search.limit||this.info.limit);await this.dataSource.search(filter,this.dataSource.pageIndex||1,fields)}else if(search.id&&this.dataSource.recordId!==search.id){this.scope.record=null;this.dataSource.get(search.id)}if(search.page==null&&this.viewType!=="form"){this.location.search("page",1);this.location.search("limit",this.info.limit)}}else{}this._currentParams[this.viewType]=jQuery.extend({},search);this._currentPath=this.location.$$path;if(search.title)this.info.display_name=search.title}_setViewType(viewType){let saveState=this.viewType&&this.searchView;if(viewType===0)for(let v of this.viewModes)if(v!=="form"){viewType=v;break}let data;if(saveState){data=this.searchView.dump();this.searchParams=this.searchView.query.getParams()}const search=this.location.$$search;if(viewType!=="form")delete search.id;search.view_type=viewType;this.routeUpdate(search);this.location.search(search);if(saveState)setTimeout(()=>this.searchView.load(data),0)}get dataSource(){return this.scope.dataSource}apply(){if(this.viewModes.length){let templ=[];for(let[k,v]of Object.entries(this.views)){let viewCls=Katrid.UI.Views[k];if(viewCls){let view=new viewCls(this,this.scope,v,v.content);this._cachedViews[k]=view;let s=view.render();if(!_.isString(s))s=s[0].outerHTML;templ.push(`<div class="action-view" ng-if="action.viewType === '${k}'">${s}</div>`)}}this._template=templ.join("")}else{let viewCls=Katrid.UI.Views[this.viewType];let view=new viewCls(this,this.scope,this.view,this.view.content);this._cachedViews[this.viewType]=view;this._template=view.render()}}async execute(){if(!this.views){let res=await this.model.loadViews({views:this.info.views,action:this.info.id,toolbar:true});this.fields=res.fields;this.fieldList=res.fieldList;console.log(this.fieldList);this.views=res.views}}get viewType(){return this._viewType}set viewType(value){if(value===this._viewType)return;if(!this._viewType)this.searchViewType=this.viewModes[0];this.view=this.views[value];this._viewType=value}setViewType(type,search){this.viewType=type;if(!search)search={view_type:type};this.location.search(search)}set view(value){this._view=value;if(this.scope)this.scope.view=value}get view(){return this._view}get template(){if(!this._template)this.apply();return this._template}render(scope,html,viewType){if(!this.isDialog){html=Katrid.UI.Utils.Templates[`preRender_${viewType}`](scope,html)}return Katrid.core.setContent(html,this.scope)}searchText(q){return this.location.search("q",q)}_prepareParams(params){const r={};for(let p of Array.from(params)){if(p.field&&p.field.type==="ForeignKey"){r[p.field.name]=p.id}else{r[p.id.name+"__icontains"]=p.text}}return r}setSearchParams(params){let p={};if(this.info.domain)p=$.parseJSON(this.info.domain);for(let[k,v]of Object.entries(p)){let arg={};arg[k]=v;params.push(arg)}return this.dataSource.search(params)}applyGroups(groups){return this.dataSource.groupBy(groups[0])}doViewAction(viewAction,target,confirmation,prompt){return this._doViewAction(this.scope,viewAction,target,confirmation,prompt)}_doViewAction(scope,viewAction,target,confirmation,prompt){let promptValue=null;if(prompt){promptValue=window.prompt(prompt)}if(!confirmation||confirmation&&confirm(confirmation)){return this.model.doViewAction({action_name:viewAction,target:target,prompt:promptValue}).then(function(res){let msg,result;if(res.status==="open"){return window.open(res.open)}else if(res.status==="fail"){return(()=>{result=[];for(msg of Array.from(res.messages)){result.push(Katrid.Dialogs.Alerts.error(msg))}return result})()}else if(res.status==="ok"&&res.result.messages){return(()=>{const result1=[];for(msg of Array.from(res.result.messages)){result1.push(Katrid.Dialogs.Alerts.success(msg))}return result1})()}})}}async formButtonClick(id,meth,self){const res=await this.scope.model.post(meth,{kwargs:{id:id}});if(res.ok&&res.result.type){const act=new Katrid.Actions[res.result.type](res.result,this.scope,this.scope.location);act.execute()}}doBindingAction(evt){this.selection;Katrid.Services.Actions.load($(evt.currentTarget).data("id")).then(action=>{if(action.action_type==="ir.action.report")ReportAction.dispatchBindingAction(this,action)})}listRowClick(index,row,evt){const search={view_type:"form",id:row.id};if(evt.ctrlKey){const url=`#${this.location.$$path}?${$.param(search)}`;window.open(url);return}if(row._group){row._group.expanded=!row._group.expanded;row._group.collapsed=!row._group.expanded;if(row._group.expanded){this.dataSource.expandGroup(index,row)}else{this.dataSource.collapseGroup(index,row)}}else{this.dataSource.recordIndex=index;this.setViewType("form",search)}}autoReport(){return this.model.autoReport().then(function(res){if(res.ok&&res.result.open){return window.open(res.result.open)}})}showDefaultValueDialog(){const html=Katrid.UI.Utils.Templates.getSetDefaultValueDialog();const modal=$(Katrid.core.compile(html)(this.scope)).modal();modal.on("hidden.bs.modal",function(){$(this).data("bs.modal",null);return $(this).remove()})}selectToggle(el){this._selection=$(el).closest("table").find("td.list-record-selector :checkbox").filter(":checked");this.selectionLength=this._selection.length}get selection(){if(this._selection)return Array.from(this._selection).map(el=>$(el).data("id"))}deleteAttachment(attachments,index){let att=attachments[index];if(confirm(Katrid.i18n.gettext("Confirm delete attachment?"))){attachments.splice(index,1);Katrid.Services.Attachments.destroy(att.id)}}}WindowAction.initClass();class ReportAction extends Action{static initClass(){this.actionType="ir.action.report"}static async dispatchBindingAction(parent,action){let format=localStorage.katridReportViewer||"pdf";let sel=parent.selection;if(sel)sel=sel.join(",");let params={data:[{name:"id",value:sel}]};const svc=new Katrid.Services.Model("ir.action.report");let res=await svc.post("export_report",{args:[action.id],kwargs:{format:format,params:params}});if(res.open)return window.open(res.open)}constructor(info,scope,location){super(info,scope,location);this.userReport={}}userReportChanged(report){return this.location.search({user_report:report})}async routeUpdate(search){this.userReport.id=search.user_report;if(this.userReport.id){const svc=new Katrid.Services.Model("ir.action.report");let res=await svc.post("load_user_report",{kwargs:{user_report:this.userReport.id}});this.userReport.params=res.result}else{}}get template(){return Katrid.Reports.Reports.renderDialog(this)}}ReportAction.initClass();class ViewAction extends Action{static initClass(){this.actionType="ir.action.view"}routeUpdate(search){return Katrid.core.setContent(this.info.content,this.scope)}}ViewAction.initClass();class UrlAction extends Action{static initClass(){this.actionType="ir.action.url"}constructor(info,scope,location){super(info,scope,location);window.location.href=info.url}}UrlAction.initClass();class ClientAction extends Action{static initClass(){this.actionType="ir.action.client";this.registry={};this.register("refresh","tag_refresh")}static register(tag,obj){this.registry[tag]=obj}static dispatchAction(parent,act){let action=this.registry[act.tag];if(action.prototype instanceof Katrid.UI.Views.ActionView){action=new action(parent.scope);action.renderTo(parent)}else console.log("is a function")}tag_refresh(){this.dataSource.refresh()}execute(){let tag=ClientAction.registry[this.info.tag];if(tag.prototype instanceof Katrid.UI.Views.ClientView)this.tag=new tag(this);else if(_.isString(tag))this[tag].apply(this)}async routeUpdate(location){}get template(){return this.tag.template}}ClientAction.initClass();this.Katrid.Actions={Action:Action,WindowAction:WindowAction,ReportAction:ReportAction,ViewAction:ViewAction,UrlAction:UrlAction,ClientAction:ClientAction,ActionManager:ActionManager,actionManager:new ActionManager};this.Katrid.Actions[WindowAction.actionType]=WindowAction;this.Katrid.Actions[ReportAction.actionType]=ReportAction;this.Katrid.Actions[ViewAction.actionType]=ViewAction;this.Katrid.Actions[UrlAction.actionType]=UrlAction;this.Katrid.Actions[ClientAction.actionType]=ClientAction})();(function(){class DataSourceState{static initClass(){this.inserting="inserting";this.browsing="browsing";this.editing="editing";this.loading="loading";this.inactive="inactive"}}DataSourceState.initClass();DEFAULT_REQUEST_INTERVAL=300;class DataSource{constructor(scope){this.readonly=false;this.$modifiedRecords=[];this.scope=scope;this.action=scope.action;this._recordIndex=0;this.recordCount=null;this.loading=false;this.loadingRecord=false;this._masterSource=null;this.pageIndex=0;this.pageLimit=100;this.offset=0;this.offsetLimit=0;this.requestInterval=DEFAULT_REQUEST_INTERVAL;this.pendingRequest=null;this.fieldName=null;this.children=[];this.modifiedData=null;this.uploading=0;this._state=null;this.fieldWatchers=[];this._pendingChanges=false}addFieldWatcher(field){}get fields(){return this.scope.view.fields}get loadingAction(){return this._loadingAction}set loadingAction(v){if(v)this.requestInterval=0;else this.requestInterval=DEFAULT_REQUEST_INTERVAL;this._loadingAction=v}async cancel(){if(!this.changing)return;for(let child of this.children)child.cancel();this._recordIndex=null;this._pendingChanges=false;if(this.state===DataSourceState.inserting&&Katrid.Settings.UI.goToDefaultViewAfterCancelInsert){this.record={};this.scope.action.setViewType("list")}else{if(this.state===DataSourceState.editing){if(this.scope.record){let r=await this.refresh([this.scope.record.id]);this.state=DataSourceState.browsing;this.recordId=this.record.id}}else{this.record={};this.state=DataSourceState.browsing}}}saveAndClose(){const r=this.saveChanges(false);if(r&&$.isFunction(r.promise)){return r.then(res=>{if(res.ok&&res.result)this.scope.result=res.result;return $(this.scope.root).closest(".modal").modal("toggle")})}}async copy(id){let res=await this.model.copy(id);this.record={};this.state=DataSourceState.inserting;this.setValues(res);this.scope.$apply();return res}findById(id){for(let rec of this.scope.records)if(rec.id===id)return rec;return null}hasKey(id){return this.findById(id)!==null}refresh(data){let r;if(data){r=this.get(data[0])}else if(this.scope.record.id){r=this.get(this.scope.record.id)}else{r=this.search(this._params,this._page)}r.then(()=>{for(let child in this.children)if(child.invalidate){child.invalidate(this.recordId);child.scope.$apply()}});return r}_validateForm(elForm,form,errorMsgs){let elfield;console.log(form.$error);for(let errorType in form.$error)for(let child of Array.from(form.$error[errorType])){if(child.$name.startsWith("grid-row-form"))elfield=this._validateForm(elForm.find("#"+child.$name),child,errorMsgs);else{elfield=elForm.find(`.form-field[name="${child.$name}"]`);elfield.addClass("ng-touched");let scope=angular.element(elForm).scope();const field=scope.view.fields[child.$name];errorMsgs.push(`<span>${field.caption}</span><ul><li>${Katrid.i18n.gettext("This field cannot be empty.")}</li></ul>`)}}return elfield}validate(){if(this.scope.form.$invalid){let elfield;let errors=[];let s=`<span>${Katrid.i18n.gettext("The following fields are invalid:")}</span><hr>`;const el=this.scope.formElement;elfield=this._validateForm(el,this.scope.form,errors);Katrid.uiKatrid.setFocus(elfield);s+=errors.join("");Katrid.Dialogs.Alerts.error(s);return false}return true}indexOf(obj){return this.scope.records.indexOf(this.findById(obj.id))}search(params,page,fields,timeout){let master=this.masterSource;if(this.groups&&!this.groups.length&&this.scope.defaultGrouping){let g={context:{grouping:[this.scope.defaultGrouping]}};this.groupBy(g);return}this._params=params;this._page=page;this._clearTimeout();this.pendingRequest=true;this.loading=true;page=page||1;this.pageIndex=page;let{domain:domain}=this.scope.action.info;if(domain){domain=JSON.parse(domain)}params={count:true,page:page,params:params,fields:fields,domain:domain,limit:this.limit};return new Promise((resolve,reject)=>{let req=()=>{this.model.search(params).catch(res=>{return reject(res)}).then(res=>{if(this.pageIndex>1){this.offset=(this.pageIndex-1)*this.pageLimit+1}else{this.offset=1}this.scope.$apply(()=>{if(res.count!=null)this.recordCount=res.count;let data=res.data;if(this.readonly)this.scope.records=data;else this.scope.records=data.map(obj=>Katrid.Data.createRecord(obj,this));if(this.pageIndex===1){return this.offsetLimit=this.scope.records.length}else{return this.offsetLimit=this.offset+this.scope.records.length-1}});return resolve(res)}).finally(()=>{this.pendingRequest=false;this.scope.$apply(()=>{this.loading=false})})};if((this.requestInterval>0||timeout)&&timeout!==false)this.pendingRequest=setTimeout(req,this.requestInterval);else req()})}groupBy(group){if(!group){this.groups=[];return}this.scope.groupings=[];this.groups=[group];return this.model.groupBy(group.context).then(res=>{this.scope.records=[];const groupName=group.context.grouping[0];for(let r of Array.from(res)){let s=r[groupName];if($.isArray(s)){r._paramValue=s[0];s=s[1]}else{r._paramValue=s}r.__str__=s;r.expanded=false;r.collapsed=true;r._searchGroup=group;r._paramName=groupName;r._domain={};r._domain[r._paramName]=r._paramValue;const row={_group:r,_hasGroup:true};let grouping=r;this.scope.groupings.push(grouping);if(this.autoLoadGrouping){(grouping=>{this.model.search({params:r._domain}).then(res=>{if(res.ok)this.scope.$apply(()=>{grouping.records=res.result.data})})})(grouping)}this.scope.records.push(row)}return this.scope.$apply()})}goto(index){return this.recordIndex=index}moveBy(index){const newIndex=this._recordIndex+index;if(newIndex>-1&&newIndex<this.scope.records.length)this.recordIndex=newIndex}_clearTimeout(){this.loading=false;this.loadingRecord=false;this._canceled=true;clearTimeout(this.pendingRequest)}set masterSource(master){this._masterSource=master;master.children.push(this)}get masterSource(){return this._masterSource}applyModifiedData(form,element,record){const data=this.getModifiedData(form,element,record);const _id=_.hash(record);if(data){let ds=this.modifiedData;if(ds==null){ds={}}let obj=ds[_id];if(!obj){obj={};ds[_id]=obj}for(let attr in data){const v=data[attr];obj[attr]=v}this.modifiedData=ds;this.masterSource.scope.form.$setDirty()}return data}getNestedData(){let ret={};for(let child of this.children)if(child.$modifiedRecords.length){let res=[];let deleted=[];for(let rec of child.$modifiedRecords){if(rec.$deleted){deleted.push(rec);if(rec.id!==null&&rec.id!==undefined)res.push({id:rec.id,action:"DESTROY"})}}for(let rec of child.$modifiedRecords){console.log(rec.$modified,rec.$modifiedData);if(rec.$modifiedData&&!rec.$deleted&&rec.$modified&&deleted.indexOf(rec)===-1){let data=this._getModified(rec.$modifiedData);if(rec.id)data["id"]=rec.id;jQuery.extend(data,child.getNestedData());if(rec.id===null||rec.id===undefined)res.push({action:"CREATE",values:data});else if(rec.id!==null&&rec.id!==undefined)res.push({action:"UPDATE",values:data})}}if(Object.keys(res).length>0)ret[child.fieldName]=res}return ret}save(autoRefresh=true){console.log("SUBMIT",this.record.$record.toObject());for(let child of this.children)if(child.changing)child.scope.save();const el=this.scope.formElement;if(this.validate()){const data=this.record.$record.toObject();this.scope.form.data=data;let beforeSubmit=el.attr("before-submit");if(beforeSubmit)beforeSubmit=this.scope.$eval(beforeSubmit);if(data){this.uploading++;return this.model.write([data]).then(res=>{this.scope.action.location.search("id",res[0]);this.scope.form.$setPristine();this.scope.form.$setUntouched();this._pendingChanges=false;this.state=DataSourceState.browsing;if(autoRefresh)return this.refresh(res)}).catch(error=>{let s=`<span>${Katrid.i18n.gettext("The following fields are invalid:")}<hr></span>`;if(error.message)s=error.message;else if(error.messages){let elfield;for(let fld of Object.keys(error.messages)){const msgs=error.messages[fld];let field;if(fld.indexOf(".")>-1){fld=fld.split(".");let subField=fld[1];for(let child of this.children)if(child.scope.fieldName===fld[0]){field=child.scope.view.fields[subField]}}else field=this.scope.view.fields[fld];console.log("field invalid",field);if(!field||!field.name)continue;elfield=el.find(`.form-field[name="${field.name}"]`);elfield.addClass("ng-invalid ng-touched");s+=`<strong>${field.caption}</strong><ul>`;for(let msg of msgs){s+=`<li>${msg}</li>`}s+="</ul>"}if(elfield)elfield.focus()}return Katrid.Dialogs.Alerts.error(s)}).finally(()=>this.scope.$apply(()=>this.uploading--))}else Katrid.Dialogs.Alerts.warn(Katrid.i18n.gettext("No pending changes"))}}_getNested(recs){let res=[];if(recs.$deleted&&recs.$deleted.recs.length)for(let rec of recs.$deleted.recs)res.push({id:rec.id,action:"DESTROY"});let vals;if(recs.recs.length)for(let rec of recs.recs)if(rec){vals={};if(rec.$created)vals={action:"CREATE",values:this._getModified(rec.$modifiedData)};else if(rec.$modified){vals={action:"UPDATE",values:this._getModified(rec.$modifiedData)};vals.values.id=rec.id}else continue;res.push(vals)}return res}_getModified(data){let res={};if(data)for(let[k,v]of Object.entries(data))if(v instanceof Katrid.Data.SubRecords){res[k]=this._getNested(v)}else res[k]=v;return res}getModifiedData(form,element,record){let data={};if(record.$modified)jQuery.extend(data,this._getModified(record.$modifiedData));if(this.record.id)data["id"]=record.id;return data}get(id,timeout,apply=true,index=false){this._clearTimeout();this.state=DataSourceState.loading;this.loadingRecord=true;this._canceled=false;return new Promise((resolve,reject)=>{const _get=()=>{return this.model.getById(id).catch(res=>{return reject(res)}).then(res=>{if(this._canceled||!res)return;if(this.state===DataSourceState.loading)this.state=DataSourceState.browsing;else if(this.state===DataSourceState.inserting)return;this.record=res.data[0];if(apply)this.scope.$apply();if(index!==false)this.scope.records[index]=this.record;return resolve(this.record)}).finally(()=>{return this.scope.$apply(()=>{return this.loadingRecord=false})})};if(!timeout&&!this.requestInterval)return _get();else this.pendingRequest=setTimeout(_get,timeout||this.requestInterval)})}insert(){this._clearTimeout();for(let child of this.children)child._clearTimeout();let rec={};rec.$created=true;this.record=rec;return this.model.getDefaults().then(res=>{this.scope.$apply(()=>{for(let child of this.children)child.scope.records=[];this.state=DataSourceState.inserting;this.scope.record.display_name=Katrid.i18n.gettext("(New)");if(res.result)this.setValues(res.result)})})}_new(){return Katrid.Data.createRecord({},this)}setValues(values){Object.entries(values).forEach(([k,v])=>{let fld=this.action.view.fields[k];if(fld)fld.fromJSON(v,this);else this.scope.record[k]=v});for(let child of this.children)child.scope.$apply();this.scope.$apply()}edit(){this.state=DataSourceState.editing}toClientValue(attr,value){const field=this.scope.view.fields[attr];if(field){if(field.type==="DateTimeField"){value=new Date(value)}}return value}fieldByName(fieldName){return this.scope.view.fields[fieldName]}set state(state){this._modifiedFields=[];this._state=state;this.inserting=state===DataSourceState.inserting;this.editing=state===DataSourceState.editing;this.loading=state===DataSourceState.loading;this.changing=[DataSourceState.editing,DataSourceState.inserting].includes(this.state);if(this.changing)setTimeout(()=>{if(this.action.$element)for(let el of Array.from(this.action.$element.find("input[type!=hidden].form-field:visible"))){el=$(el);if(!el.attr("readonly")){$(el).focus();return}}})}get browsing(){return this._state===DataSourceState.browsing}childByName(fieldName){for(let child of this.children){if(child.fieldName===fieldName)return child}}get state(){return this._state}get record(){return this.scope.record}set recordId(value){this.scope.recordId=value;for(let child of this.children)child.scope.masterChanged(value)}get recordId(){return this.scope.recordId}set record(rec){this.scope.record=Katrid.Data.createRecord(rec,this);this.recordId=rec.id;this._pendingChanges=false;if(this.scope.form)this.scope.form.$setPristine()}next(){return this.moveBy(1)}prior(){return this.moveBy(-1)}nextPage(){let p=this.recordCount/this.pageLimit;if(Math.floor(p)){p++}if(p>this.pageIndex+1){return this.scope.action.location.search("page",this.pageIndex+1)}}prevPage(){if(this.pageIndex>1){return this.scope.action.location.search("page",this.pageIndex-1)}}set recordIndex(index){this._recordIndex=index;if(!this.masterSource)return this.action.location.search("id",this.scope.records[index].id);this.scope.record=this.scope.records[index];this.scope.recordId=null}get recordIndex(){return this._recordIndex}expandGroup(index,row){const rg=row._group;const params={params:{}};params.params[rg._paramName]=rg._paramValue;return this.model.search(params).then(res=>{if(res.ok&&res.result.data){return this.action.scope.$apply(()=>{rg._children=res.result.data;return this.action.scope.records.splice.apply(this.scope.records,[index+1,0].concat(res.result.data))})}})}collapseGroup(index,row){const group=row._group;this.scope.records.splice(index+1,group._children.length);return delete group._children}_applyResponse(res){if(res.value)this.setValues(res.value);this.scope.$apply()}dispatchEvent(name,...args){this.model.rpc(name,...args).then(res=>this._applyResponse(res))}get model(){return this.scope.model}get parent(){return this.masterSource}$setDirty(field){this.scope.$setDirty(field)}}Katrid.Data={DataSource:DataSource,DataSourceState:DataSourceState}})();(function(){class Record{constructor(data,dataSource,state){this.raw=data;this.data={};this.old=jQuery.extend({},data);this.dataSource=dataSource;this.pending=null;this.modified=false;this.children=[];this.state=state;this.submitted=false;data.$record=this}get scope(){return this.dataSource.scope}get pk(){return this.raw.id}$delete(){this.state=RecordState.destroyed;if(this.pk)this.setModified();else if(this.parent.children.indexOf(this)>-1)this.parent.children.splice(this.parent.children.indexOf(this),1)}_prepareRecord(rec){let res={};Object.entries(rec).map(obj=>{if(!obj[0].startsWith("$"))res[obj[0]]=obj[1]});return res}setModified(field){if(!this.modified&&this.state!==RecordState.destroyed){if(this.pk)this.state=RecordState.modified;else this.state=RecordState.created}if(field)this.dataSource.$setDirty(field);this.dataSource._pendingChanges=true;this.modified=true;if(this.parent&&this.scope.fieldName){this.parent.setModified(this.scope.fieldName);this.parent.addChild(this)}}get parent(){return this.dataSource.parent&&this.dataSource.parent.record.$record}addChild(child){this.setModified(child.scope.fieldName);if(this.children.indexOf(child)===-1){this.children.push(child)}}compare(oldValue,newValue){if(_.isArray(oldValue)&&_.isArray(newValue))return oldValue.join(",")!==newValue.join(",");return oldValue!=newValue}set(propKey,value){let field=this.dataSource.fieldByName(propKey);if(field){let oldValue=this.raw[propKey];value=field.toJSON(value);if(this.compare(oldValue,value)){this.setModified(propKey);this.data[propKey]=value;this.modified=true;if(field.onChange){let rec=this._prepareRecord(this.raw);rec[propKey]=value;this.dataSource.dispatchEvent("field_change_event",[propKey,rec])}}}return true}$new(){return Record(this.raw)}toObject(){let data=jQuery.extend({},this.data);if(this.pk)data.id=this.pk;for(let child of this.children){if(!(child.scope.fieldName in data))data[child.scope.fieldName]=[];if(child.state===RecordState.created)data[child.scope.fieldName].push({action:"CREATE",values:child.toObject()});else if(child.state===RecordState.modified)data[child.scope.fieldName].push({action:"UPDATE",values:child.toObject()});else if(child.state===RecordState.destroyed)data[child.scope.fieldName].push({action:"DESTROY",id:child.pk})}return data}}class SubRecords{constructor(recs){this.recs=recs}append(rec){if(this.recs.indexOf(rec)===-1)this.recs.push(rec)}}function createRecord(rec,dataSource){new Record(rec,dataSource);return new Proxy(rec,{set(target,propKey,value,receiver){let scope=dataSource.scope;if(!propKey.startsWith("$$")){if(!propKey.startsWith("$")&&scope){rec.$record.set(propKey,value)}}return Reflect.set(target,propKey,value,receiver)}})}class RecordState{static initClass(){this.destroyed="destroyed";this.created="created";this.modified="modified"}}RecordState.initClass();Katrid.Data.RecordState=RecordState;Katrid.Data.createRecord=createRecord;Katrid.Data.SubRecords=SubRecords})();(function(){class Field{constructor(info){this._info=info;this.displayChoices=_.object(info.choices)}static fromInfo(info){let cls=Katrid.Data.Fields[info.type]||StringField;return new cls(info)}static fromArray(fields){let r={};Object.keys(fields).map(k=>r[k]=this.fromInfo(fields[k]));return r}fromJSON(value,dataSource){dataSource.record[this.name]=value}get onChange(){return this._info.onchange}get hasChoices(){return this._info.choices&&this._info.choices.length>0}get choices(){return this._info.choices}get name(){return this._info.name}get model(){return this._info.model}get caption(){return this._info.caption}get readonly(){return this._info.readonly}get maxLength(){return this._info.max_length}get type(){return this._info.type}get paramTemplate(){return"view.param.String"}format(value){return value.toString()}toJSON(val){return val}createWidget(widget,scope,attrs,element){if(!widget){if(this.name==="status")widget="StatusField";else if(this.hasChoices)widget="SelectionField"}let cls=Katrid.UI.Widgets[widget||this.type]||Katrid.UI.Widgets.StringField;return new cls(scope,attrs,this,element)}validate(){}get defaultCondition(){return"="}isControlVisible(condition){switch(condition){case"is null":return false;case"is not null":return false}return true}}class StringField extends Field{}class BooleanField extends Field{get paramTemplate(){return"view.param.Boolean"}}class DateField extends Field{toJSON(val){return val}get paramTemplate(){return"view.param.Date"}format(value){if(_.isString(value))return moment(value).format(Katrid.i18n.gettext("yyyy-mm-dd").toUpperCase());return""}}class DateTimeField extends DateField{get paramTemplate(){return"view.param.DateTime"}}class NumericField extends Field{toJSON(val){if(val&&_.isString(val))return parseFloat(val);return val}}class IntegerField extends Field{toJSON(val){if(val&&_.isString(val))return parseInt(val);return val}get paramTemplate(){return"view.param.Integer"}}class FloatField extends NumericField{}class DecimalField extends NumericField{}class ForeignKey extends Field{toJSON(val){if(_.isArray(val))return val[0];return val}}class OneToManyField extends Field{get field(){return this._info.field}fromJSON(val,dataSource){if(val&&val instanceof Array){val.map(obj=>{if(obj.action==="CREATE"){let child=dataSource.childByName(this.name);child.scope.addRecord(obj.values)}})}}}class ManyToManyField extends ForeignKey{toJSON(val){if(_.isArray(val))return val.map(obj=>_.isArray(obj)?obj[0]:obj);else if(_.isString(val))val=val.split(",");return val}}Katrid.Data.Fields={Field:Field,StringField:StringField,IntegerField:IntegerField,FloatField:FloatField,DecimalField:DecimalField,DateTimeField:DateTimeField,ForeignKey:ForeignKey,OneToManyField:OneToManyField,ManyToManyField:ManyToManyField,DateField:DateField,BooleanField:BooleanField}})();(function(){class View{constructor(info){this._info=info;this.fields=info.fields;this.content=info.content;this.toolbar=info.toolbar}}Katrid.Data.View=View})();(function(){Katrid.bootstrap();const ngApp=angular.module("katridApp",["ui.router","ngRoute","ngCookies","ngSanitize","cfp.hotkeys","ui.katrid"].concat(Katrid.Settings.additionalModules));ngApp.config(["$locationProvider",function($locationProvider){$locationProvider.hashPrefix("")}]);ngApp.run(function($rootScope,$state,$transitions){});ngApp.run(["$route","$rootScope","$location","$templateCache",($route,$rootScope,$location,$templateCache)=>{Katrid.UI.Templates.init($templateCache);let original=$location.path;$location.path=function(path,reload,info){if(info){let un=$rootScope.$on("$locationChangeSuccess",function(){un()})}r=original.apply($location,[path]);return r}}]);ngApp.config(function($stateProvider){$stateProvider.state("menuEntry",{url:"/menu/:menuId/",controller:"MenuController",reloadOnSearch:false}).state("actionView",{url:"/action/:actionId/?view_type&id",reloadOnSearch:false,controller:"ActionController",resolve:{action:["$stateParams","$state","$location",async($stateParams,$state,$location)=>{let params=$stateParams;Katrid.Actions.actionManager.clear();let info=await Katrid.Services.Actions.load(params.actionId);let model=new Katrid.Services.Model(info.model);let action=new Katrid.Actions[info.action_type](info,null,$location);action.model=model;$state.$current.data={action:action};await action.execute();return action}]},templateProvider:async($stateParams,$state)=>{return $state.$current.data.action.template}}).state("modelView",{url:"/action/:service/view/?view_type&id",controller:"ActionController",reloadOnSearch:false,resolve:{action:["$stateParams","$state","$location",async function($stateParams,$state,$location){let info=await new Katrid.Services.Model($stateParams.service).rpc("get_formview_action",[$stateParams.id]);let model=info.model;if(model instanceof Array)model=model[1];model=new Katrid.Services.Model(model);let action=new Katrid.Actions[info.action_type](info,null,$location);action.model=model;$state.$current.data={action:action};await action.execute();action.viewType=$stateParams.view_type;return action}]},templateProvider:($stateParams,$state)=>{return $state.$current.data.action.template}})});ngApp.controller("MenuController",function($scope,$stateParams){setTimeout(()=>{let menu=$stateParams.menuId;let action=$(`#left-side-menu[data-menu-id='${menu}']`).find(".menu-item-action").first();$scope.$parent.current_menu=parseInt(menu);action.click()},0)});ngApp.controller("LoginController",function($scope,$location){$scope.login=((username,password)=>{$scope.loading=true;Katrid.Services.Auth.login(username,password).then(res=>{if(res.success){console.log(res.redirect);$scope.messages=[{message:_.gettext("Loading..."),type:"success"}];if($location.$$url)window.location.href="/web/#"+$location.$$url;else if(res.redirect)window.location.href=res.redirect}else{$scope.loading=false;$scope.messages=[{message:res.message,type:"danger"}]}$scope.$apply()}).catch(()=>{$scope.loading=false;$scope.$apply()})})});class DialogLocation{constructor(){this.$$search={}}search(){}}let $set=function(field,value){$scope.record[field]=value;$scope.$setDirty(field)};ngApp.controller("ActionController",function($scope,$compile,$state,$location,hotkeys,$element,action){Katrid.core.compile=$compile;action.$state=$state;action.scope=$scope;action.$element=$element;console.log("action controller",$location);if(action instanceof Katrid.Actions.WindowAction)action.viewType=$location.$$search.view_type||action.viewModes[0];$scope.action=action;$scope.model=action.model;$scope._=_;$scope.data=null;$scope.record=null;Object.defineProperty($scope,"self",{get:()=>$scope.record});$scope.recordIndex=null;$scope.recordId=null;$scope.records=null;$scope.recordCount=0;$scope.dataSource=new Katrid.Data.DataSource($scope);$scope.$setDirty=(field=>{const control=$scope.form[field];if(control){control.$setDirty()}});action.routeUpdate($location.$$search).then(()=>{action._unregisterHook=$scope.$on("$locationChangeSuccess",()=>{action.routeUpdate($location.$$search)})});hotkeys.bindTo($scope).add({combo:"ctrl+s",description:"Save record changes",allowIn:["INPUT","SELECT","TEXTAREA"],callback:evt=>{evt.preventDefault();$scope.dataSource.save()}}).add({combo:"f2",description:"Edit record",allowIn:["INPUT","SELECT","TEXTAREA"],callback:evt=>{evt.preventDefault();$scope.dataSource.edit();console.log("edit")}}).add({combo:"esc",allowIn:["INPUT","SELECT","TEXTAREA"],callback:evt=>{if(!$(evt.target).hasClass("modal")){let btn=$(".maximize-button").first();if($scope.dataSource&&$scope.dataSource.changing){evt.preventDefault();$scope.dataSource.cancel()}else if(btn.closest("div.card.data-panel").hasClass("box-fullscreen")){evt.preventDefault();btn.click()}}}})});ngApp.controller("ActionController1",function($scope,$compile,$location,$route,action,reset,hotkeys){prepareScope($scope,$location);Katrid.core.setContent=setContent;Katrid.core.compile=$compile;$scope.Katrid=Katrid;$scope.$on("$locationChangeStart",function(event){if($scope.dataSource&&$scope.dataSource._pendingChanges){let answer=confirm(Katrid.i18n.gettext("You still have pending changes, are you sure you want to leave this page?"));if(!answer)event.preventDefault()}});let initAction=action=>{let act,location;if($scope.isDialog)location=new DialogLocation;else location=$location;$scope.action=act=new Katrid.Actions[action.action_type](action,$scope,location);if(action.__cached)act.views=Katrid.Actions.Action.history[Katrid.Actions.Action.history.length-1].views;if(reset)Katrid.Actions.Action.history=[];Katrid.Actions.Action.history.push($scope.action);if(_.isArray(action.model))action.model=action.model[1];if(action.model)$scope.model=new Katrid.Services.Model(action.model,$scope);if($scope.isDialog)act.isDialog=$scope.isDialog;if($scope.parentAction)act.parentAction=$scope.parentAction;if(act&&act.isDialog){act.routeUpdate({view_type:action.view_type});act.createNew()}else act.routeUpdate($location.$$search)};if($scope.parentAction){}else{Katrid.core.rootElement=angular.element("#katrid-action-view");$scope.$on("$routeUpdate",()=>$scope.action.routeUpdate($location.$$search))}initAction(action)});this.Katrid.ngApp=ngApp})();(()=>{class BaseObject{doAction(act){}}class Widget extends BaseObject{}class Component extends BaseObject{controller($scope){$scope.doAction=this.doAction}}Katrid.UI.Widgets={Widget:Widget,Component:Component}})();(function(){let uiKatrid=Katrid.uiKatrid;let formCount=0;uiKatrid.directive("field",function($compile){return{restrict:"E",replace:true,priority:-1,link(scope,element,attrs,ctrl){let inplaceEditor=$(element).closest(".table.dataTable").length>0;let field=scope.view.fields[attrs.name];if(field&&field.visible===false){element.remove();return}if(attrs.label)field.caption=attrs.label;if(!element.parent("list").length){let v;element.removeAttr("name");if(_.isUndefined(field))throw Error("Field not found: "+attrs.name);let widget=field.createWidget(attrs.widget,scope,attrs,element);widget.inplaceEditor=inplaceEditor;let templ=widget.renderTo("section",inplaceEditor);templ=$compile(templ)(scope);element.replaceWith(templ);if(!inplaceEditor&&widget.col)templ.addClass(`col-md-${widget.col}`);let fcontrol=templ.find(".form-field");if(fcontrol.length){fcontrol=fcontrol[fcontrol.length-1];const form=templ.controller("form");ctrl=angular.element(fcontrol).data().$ngModelController;if(ctrl)form.$addControl(ctrl)}let fieldAttrs={};widget.link(scope,templ,fieldAttrs,$compile,field);for(let[k,v]of Object.entries(attrs))if(k.startsWith("field")){fieldAttrs[k]=v;element.removeAttr(k);attrs.$set(k)}fieldAttrs.name=attrs.name}}}});uiKatrid.directive("inputField",()=>({restrict:"A",scope:false,link(scope,element,attrs){$(element).on("click",function(){$(this).select()})}}));uiKatrid.directive("view",()=>({restrict:"E",template(element,attrs){formCount++;return""},link(scope,element,attrs){if(scope.model){element.attr("class",`view-form-${scope.model.name.replace(new RegExp(".","g"),"-")}`);element.attr("id",`katrid-form-${formCount.toString()}`);element.attr("model",scope.model);return element.attr("name",`dataForm${formCount.toString()}`)}}}));class Total{constructor($filter){this.restrict="E";this.scope=false;this.replace=true;this.$filter=$filter}template(el,attrs){if(attrs.type[0]==="'")return`<span>${attrs.type.substring(1,attrs.type.length-1)}</span>`;else return`<span ng-bind="total$${attrs.field}|number:2"></span>`}link(scope,element,attrs,controller){if(attrs.type[0]!=="'")scope.$watch(`records`,newValue=>{let total=0;newValue.map(r=>total+=parseFloat(r[attrs.field]));console.log("RECORDS CHANGED",total);scope["total$"+attrs.field]=total})}}uiKatrid.directive("ngTotal",Total);uiKatrid.directive("ngSum",()=>({restrict:"A",priority:9999,require:"ngModel",link(scope,element,attrs,controller){const nm=attrs.ngSum.split(".");const field=nm[0];const subField=nm[1];return scope.$watch(`record.$${field}`,function(newValue,oldValue){if(newValue&&scope.record){let v=0;scope.record[field].map(obj=>v+=parseFloat(obj[subField]));if(v.toString()!==controller.$modelValue){controller.$setViewValue(v);controller.$render()}}})}}));uiKatrid.directive("ngEnter",()=>(scope,element,attrs)=>element.bind("keydown keypress",event=>{if(event.which===13){scope.$apply(()=>scope.$eval(attrs.ngEnter,{$event:event}));event.preventDefault()}}));uiKatrid.directive("ngEsc",()=>(scope,element,attrs)=>element.bind("keydown keypress",event=>{if(event.which===27){scope.$apply(()=>scope.$eval(attrs.ngEsc,{$event:event}));event.preventDefault()}}));uiKatrid.directive("datetimepicker",["$filter",$filter=>({restrict:"A",require:"?ngModel",link(scope,el,attrs,controller){let calendar=$(el).datetimepicker({});const dateFmt=Katrid.i18n.gettext("yyyy-MM-dd hh:mma");if(Katrid.Settings.UI.dateInputMask===true){console.log("set input mask");el=el.mask(dateFmt.replace(/[A-z]/g,0))}else if(Katrid.Settings.UI.dateInputMask){el=el.mask(Katrid.Settings.UI.dateInputMask)}el.on("click",()=>setTimeout(()=>$(el).select()));controller.$formatters.push(function(value){if(value){const dt=new Date(value);return $filter("date")(value,dateFmt)}return value});controller.$render=function(){if(_.isDate(controller.$viewValue)){const v=$filter("date")(controller.$viewValue,dateFmt);return el.val(v)}else{return el.val(controller.$viewValue)}}}})]);uiKatrid.directive("datepicker",["$filter",$filter=>({restrict:"A",priority:1,require:"?ngModel",link(scope,element,attrs,controller){let el=element;const dateFmt=Katrid.i18n.gettext("yyyy-mm-dd");const shortDate=dateFmt.replace(/[m]/g,"M");var calendar=element.parent("div").datePicker({format:dateFmt,keyboardNavigation:false,language:Katrid.i18n.languageCode,forceParse:false,autoClose:true,showOnFocus:false}).on("changeDate",function(e){const dp=calendar.data("datepicker");if(dp.picker&&dp.picker.is(":visible")){el.val($filter("date")(dp._utc_to_local(dp.viewDate),shortDate));return dp.hide()}});el.on("click",()=>setTimeout(()=>$(el).select()));if(Katrid.Settings.UI.dateInputMask===true){el=el.mask(dateFmt.replace(/[A-z]/g,0))}else if(Katrid.Settings.UI.dateInputMask){el=el.mask(Katrid.Settings.UI.dateInputMask)}controller.$formatters.push(function(value){if(value){const dt=new Date(value);calendar.datepicker("setDate",dt);return $filter("date")(value,shortDate)}});controller.$parsers.push(function(value){if(_.isDate(value)){return moment.utc(value).format("YYYY-MM-DD")}if(_.isString(value)){return moment.utc(value,shortDate.toUpperCase()).format("YYYY-MM-DD")}});controller.$render=function(){if(_.isDate(controller.$viewValue)){const v=$filter("date")(controller.$viewValue,shortDate);return el.val(v)}else{return el.val(controller.$viewValue)}};return el.on("blur",function(evt){let sep,val;const dp=calendar.data("datepicker");if(dp.picker.is(":visible")){dp.hide()}if(Array.from(Katrid.i18n.formats.SHORT_DATE_FORMAT).includes("/")){sep="/"}else{sep="-"}const fmt=Katrid.i18n.formats.SHORT_DATE_FORMAT.toLowerCase().split(sep);const dt=new Date;let s=el.val();if(fmt[0]==="d"&&fmt[1]==="m"){if(s.length===5||s.length===6){if(s.length===6){s=s.substr(0,5)}val=s+sep+dt.getFullYear().toString()}if(s.length===2||s.length===3){if(s.length===3){s=s.substr(0,2)}val=new Date(dt.getFullYear(),dt.getMonth(),s)}}else if(fmt[0]==="m"&&fmt[1]==="d"){if(s.length===5||s.length===6){if(s.length===6){s=s.substr(0,5)}val=s+sep+dt.getFullYear().toString()}if(s.length===2||s.length===3){if(s.length===3){s=s.substr(0,2)}val=new Date(dt.getFullYear(),s,dt.getDay())}}if(val){calendar.datepicker("setDate",val);el.val($filter("date")(dp._utc_to_local(dp.viewDate),shortDate));return controller.$setViewValue($filter("date")(dp._utc_to_local(dp.viewDate),shortDate))}})}})]);uiKatrid.directive("ajaxChoices",$location=>({restrict:"A",require:"?ngModel",link(scope,element,attrs,controller){const{multiple:multiple}=attrs;const serviceName=attrs.ajaxChoices;const cfg={ajax:{type:"POST",url:serviceName,dataType:"json",quietMillis:500,params:{contentType:"application/json; charset=utf-8"},data(term,page){return JSON.stringify({q:term,count:1,page:page-1,field:attrs.field,model:attrs.modelChoices})},results(res,page){let data=res.items;const more=page*Katrid.Settings.Services.choicesPageLimit<res.count;return{results:Array.from(data).map(item=>({id:item[0],text:item[1]})),more:more}}},escapeMarkup(m){return m},initSelection(element,callback){const v=controller.$modelValue;if(v){if(multiple){const values=[];for(let i of Array.from(v)){values.push({id:i[0],text:i[1]})}return callback(values)}else{return callback({id:v[0],text:v[1]})}}}};if(multiple)cfg["multiple"]=true;const el=element.select2(cfg);element.on("$destroy",function(){$(".select2-hidden-accessible").remove();$(".select2-drop").remove();return $(".select2-drop-mask").remove()});el.on("change",function(e){const v=el.select2("data");controller.$setDirty();if(v)controller.$viewValue=v;return scope.$apply()});controller.$render=(()=>{if(controller.$viewValue)return element.select2("val",controller.$viewValue)})}}));uiKatrid.directive("uiMask",()=>({restrict:"A",link(scope,element,attrs){element.mask(attrs.uiMask)}}));class Decimal{constructor($filter){this.restrict="A";this.require="ngModel";this.$filter=$filter}link(scope,element,attrs,controller){let precision=2;if(attrs.decimalPlaces)precision=parseInt(attrs.decimalPlaces);const thousands=attrs.uiMoneyThousands||".";const decimal=attrs.uiMoneyDecimal||",";const symbol=attrs.uiMoneySymbol;const negative=attrs.uiMoneyNegative||true;const el=element.maskMoney({symbol:symbol,thousands:thousands,decimal:decimal,precision:precision,allowNegative:negative,allowZero:true}).bind("keyup blur",function(event){});controller.$render=(()=>{if(controller.$viewValue){return element.val(this.$filter("number")(controller.$viewValue,precision))}else{return element.val("")}});controller.$parsers.push(value=>{if(_.isString(value)&&value){if(precision)value=element.maskMoney("unmasked")[0];else{value=value.replace(new RegExp(`\\${thousands}`,"g"),"");value=parseInt(value)}}else if(value)return value;else value=null;return value})}}uiKatrid.directive("decimal",Decimal);Katrid.uiKatrid.directive("foreignkey",($compile,$controller)=>({restrict:"A",require:"ngModel",link(scope,el,attrs,controller){let domain,serviceName;let sel=el;let _shown=false;const field=scope.view.fields[attrs.name];if(attrs.domain!=null)domain=attrs.domain;else if(field.domain)domain=field.domain;if(_.isString(domain))domain=$.parseJSON(domain);el.addClass("form-field");if(attrs.serviceName)serviceName=attrs;else serviceName=scope.action.model.name;const newItem=function(){};const newEditItem=function(){};let _timeout=null;let config={allowClear:true,query(query){let data={args:[query.term],kwargs:{count:1,page:query.page,domain:domain,name_fields:attrs.nameFields&&attrs.nameFields.split(",")||null}};const f=()=>{let svc;if(scope.model)svc=scope.model.getFieldChoices(field.name,query.term);else svc=new Katrid.Services.Model(field.model).searchName(data);svc.then(res=>{let data=res.items;const r=data.map(item=>({id:item[0],text:item[1]}));const more=query.page*Katrid.Settings.Services.choicesPageLimit<res.count;if(!multiple&&!more){let msg;const v=sel.data("select2").search.val();if((attrs.allowCreate&&attrs.allowCreate!=="false"||attrs.allowCreate==null)&&v){msg=Katrid.i18n.gettext('Create <i>"%s"</i>...');r.push({id:newItem,text:msg})}if((attrs.allowCreateEdit&&attrs.allowCreateEdit!=="false"||!attrs.allowCreateEdit)&&v){msg=Katrid.i18n.gettext("Create and Edit...");r.push({id:newEditItem,text:msg})}}return query.callback({results:r,more:more})});return;$.ajax({url:config.ajax.url,type:config.ajax.type,dataType:config.ajax.dataType,contentType:config.ajax.contentType,data:JSON.stringify(data),success(data){const res=data.result;data=res.items;const r=data.map(item=>({id:item[0],text:item[1]}));const more=query.page*Katrid.Settings.Services.choicesPageLimit<res.count;if(!multiple&&!more){let msg;const v=sel.data("select2").search.val();if((attrs.allowCreate&&attrs.allowCreate!=="false"||attrs.allowCreate==null)&&v){msg=Katrid.i18n.gettext('Create <i>"%s"</i>...');r.push({id:newItem,text:msg})}if((attrs.allowCreateEdit&&attrs.allowCreateEdit!=="false"||!attrs.allowCreateEdit)&&v){msg=Katrid.i18n.gettext("Create and Edit...");r.push({id:newEditItem,text:msg})}}return query.callback({results:r,more:more})}})};if(_timeout)clearTimeout(_timeout);_timeout=setTimeout(f,400)},ajax:{url:`/api/rpc/${serviceName}/get_field_choices/`,contentType:"application/json",dataType:"json",type:"POST"},formatSelection(val){if(val.id===newItem||val.id===newEditItem)return Katrid.i18n.gettext("Creating...");return val.text},formatResult(state){const s=sel.data("select2").search.val();if(state.id===newItem){state.str=s;return`<strong>${sprintf(state.text,s)}</strong>`}else if(state.id===newEditItem){state.str=s;return`<strong>${sprintf(state.text,s)}</strong>`}return state.text},initSelection(el,cb){let v=controller.$modelValue;if(multiple){v=v.map(obj=>({id:obj[0],text:obj[1]}));return cb(v)}else if(_.isArray(v)){return cb({id:v[0],text:v[1]})}}};let{multiple:multiple}=attrs;if(multiple){config["multiple"]=true}sel=sel.select2(config);sel.on("change",e=>{let v=e.added;if(v&&v.id===newItem){let service=new Katrid.Services.Model(field.model);return service.createName(v.str).done(res=>{if(res.ok){controller.$setDirty();controller.$setViewValue({id:res.result[0],text:res.result[1]})}}).fail(res=>{service.getViewInfo({view_type:"form"}).done(res=>{console.log("view info",res)})})}else if(v&&v.id===newEditItem){let service=new Katrid.Services.Model(field.model);return service.getViewInfo({view_type:"form"}).done(function(res){let wnd=new Katrid.Dialogs.Window(scope,{view:res.result},$compile);wnd.show()})}else if(multiple&&e.val.length){return controller.$setViewValue(e.val)}else{controller.$setDirty();if(v){return controller.$setViewValue([v.id,v.text])}else{return controller.$setViewValue(null)}}}).on("select2-open",()=>{if(!_shown){_shown=true;let parentModal=el.closest("div.modal");if(parentModal.length)parentModal.on("hide.bs.modal",()=>sel.select2("destroy"))}});controller.$parsers.push(value=>{if(value){if(_.isArray(value))return value;else if(_.isObject(value))return[value.id,value.text];else return value}return null});if(!multiple)scope.$watch(attrs.ngModel,(newValue,oldValue)=>sel.select2("val",newValue));return controller.$render=function(){if(multiple){if(controller.$viewValue){const v=Array.from(controller.$viewValue).map(obj=>obj[0]);sel.select2("val",v)}}if(controller.$viewValue){return sel.select2("val",controller.$viewValue[0])}else{return sel.select2("val",null)}}}}));uiKatrid.filter("m2m",()=>(function(input){if(_.isArray(input))return input.map(obj=>obj?obj[1]:null).join(", ")}));uiKatrid.filter("moment",()=>(function(input,format){if(format){return moment().format(format)}return moment(input).fromNow()}));uiKatrid.directive("fileReader",()=>({restrict:"A",require:"ngModel",scope:{},link(scope,element,attrs,controller){if(attrs.accept==="image/*"){element.tag==="INPUT"}return element.bind("change",function(){const reader=new FileReader;reader.onload=(event=>controller.$setViewValue(event.target.result));return reader.readAsDataURL(event.target.files[0])})}}));uiKatrid.directive("dateInput",["$filter",$filter=>({restrict:"A",require:"?ngModel",link(scope,element,attrs,controller){let setNow=()=>{let value;if(attrs["type"]==="date")value=(new Date).toISOString().split("T")[0];else value=moment(new Date).format("YYYY-MM-DD HH:mm").replace(" ","T");$(element).val(value);controller.$setViewValue(value);_focus=false};let _focus=true;element.focus(function(){if($(this).val()==="")_focus=true}).keypress(function(evt){if(evt.key.toLowerCase()==="h"){setNow();evt.stopPropagation();evt.preventDefault()}}).keydown(function(evt){if(/\d/.test(evt.key)){if($(this).val()===""&&_focus)setNow()}});controller.$formatters.push(function(value){if(value){if(attrs["type"]==="date")return new Date(moment.utc(value).format("YYYY-MM-DD")+"T00:00");else return new Date(value)}});controller.$parsers.push(function(value){if(_.isDate(value)){if(attrs["type"]==="date")return moment.utc(value).format("YYYY-MM-DD");else return moment.utc(value).format("YYYY-MM-DDTHH:mm:ss")}})}})]);uiKatrid.directive("statusField",["$compile","$timeout",($compile,$timeout)=>({restrict:"E",require:"ngModel",replace:true,scope:{},link(scope,element,attrs,controller){const field=scope.$parent.view.fields[attrs.name];scope.choices=field.choices;if(!attrs.readonly){scope.itemClick=(()=>console.log("status field item click"))}},template(element,attrs){return sprintf(Katrid.$templateCache.get("view.field.StatusField"),{fieldName:attrs.name})}})]);uiKatrid.directive("cardDraggable",()=>{return{restrict:"A",link(scope,element,attrs,controller){let cfg={connectWith:attrs.cardDraggable,items:"> .sortable-item"};if(!_.isUndefined(attrs.cardItem))cfg["receive"]=((event,ui)=>{let parent=angular.element(ui.item.parent()).scope();let scope=angular.element(ui.item).scope();console.log(scope);console.log(parent);let data={};data["id"]=scope.record.id;$.extend(data,parent.group._domain);parent.model.write([data]).then(res=>{console.log("write ok",res)})});if(!_.isUndefined(attrs.cardGroup))cfg["update"]=((event,ui)=>{let ids=[];$.each(ui.item.parent().find(".card-group"),(idx,el)=>{ids.push($(el).data("id"))});let groupName=element.find(".card-group").first().data("group-name");let modelName=scope.$parent.$parent.view.fields[groupName].model;Katrid.Services.data.reorder(modelName,ids).done(res=>{console.log(res)})});element.sortable(cfg).disableSelection()}}});uiKatrid.directive("uiTooltip",()=>({restrict:"A",link:(scope,el,attrs)=>{$(el).tooltip({container:"body",delay:{show:200,hide:500}})}}));uiKatrid.setFocus=(el=>{let e=$(el);if(e.data("select2"))e.select2("focus");else el.focus()});uiKatrid.directive("attachmentsButton",()=>({restrict:"A",scope:false,link:(scope,el)=>{let _pendingOperation;scope.$parent.$watch("recordId",key=>{let attachment=new Katrid.Services.Model("ir.attachment",scope);scope.$parent.attachments=[];clearTimeout(_pendingOperation);_pendingOperation=setTimeout(()=>{attachment.search({params:{model:scope.action.model.name,object_id:key},count:false}).then(res=>{let r=null;if(res&&res.data)r=res.data;scope.$apply(()=>scope.attachments=r)})},1e3)})}}));uiKatrid.directive("action",$compile=>({restrict:"E",priority:99,link:(scope,el,attrs)=>{console.log("define action",attrs.ngClick);let div=el.closest("div.data-form");let actions=div.find(".dropdown-menu-actions");let name=attrs.name;let label=el.html();let html=`<li><a href="javascript:void(0)">${label}</a></li>`;let newItem=$(html);newItem.click(()=>{if(attrs.object)scope.model.rpc(attrs.object,[scope.$parent.record.id])});actions.append(newItem);el.remove()}}));class CardView{constructor(){this.restrict="E";this.scope=false}controller($scope,element,attrs){console.log("controller started");$scope.dataSource.autoLoadGrouping=true;$scope.cardShowAddGroupDlg=(event=>{$scope.cardAddGroupDlg=true;setTimeout(()=>$(event.target).closest(".card-add-group").find("input").focus(),10)});$scope.cardAddGroup=((event,name)=>{let gname=$(event.target).closest(".card-add-group").data("group-name");let field=$scope.action.view.fields[gname];let svc=new Katrid.Services.Model(field.model);console.log("the name is",name);svc.createName(name).done(res=>{console.log(res)})});$scope.cardAddItem=((event,name)=>{if(name){let ctx={};let g=$(event.target).closest(".card-group");ctx["default_"+g.data("group-name")]=g.data("sequence-id");scope.model.createName(name,ctx).done(res=>{if(res.ok){let id=res.result[0];scope.model.getById(id).done(res=>{if(res.ok){let s=angular.element(event.target).scope();let g=s.group;s.$apply(()=>{g.records.push(res.result.data[0])})}})}})}$scope.kanbanHideAddGroupItemDlg(event)})}}})();(function(){let uiKatrid=Katrid.uiKatrid;uiKatrid.controller("TabsetController",["$scope",function($scope){const ctrl=this;const tabs=ctrl.tabs=$scope.tabs=[];ctrl.select=function(selectedTab){angular.forEach(tabs,function(tab){if(tab.active&&tab!==selectedTab){tab.active=false;tab.onDeselect()}});selectedTab.active=true;selectedTab.onSelect()};ctrl.addTab=function(tab){tabs.push(tab);if(tabs.length===1){tab.active=true}else if(tab.active){ctrl.select(tab)}};ctrl.removeTab=function(tab){const index=tabs.indexOf(tab);if(tab.active&&tabs.length>1&&!destroyed){const newActiveIndex=index===tabs.length-1?index-1:index+1;ctrl.select(tabs[newActiveIndex])}tabs.splice(index,1)};var destroyed=undefined;$scope.$on("$destroy",function(){destroyed=true})}]);uiKatrid.directive("tabset",()=>({restrict:"EA",transclude:true,replace:true,scope:{type:"@"},controller:"TabsetController",template:`<div class="tabset"><div class="clearfix"></div>\n`+"  <div class=\"nav nav-{{type || 'tabs'}}\" ng-class=\"{'nav-stacked': vertical, 'nav-justified': justified}\" ng-transclude></div>\n"+'  <div class="tab-content">\n'+'    <div class="tab-pane" \n'+'         ng-repeat="tab in tabs" \n'+`         ng-class="{active: tab.active}">`+`<div class="col-12"><div class="row" tab-content-transclude="tab"></div></div>`+"    </div>\n"+"  </div>\n"+"</div>\n",link(scope,element,attrs){scope.vertical=angular.isDefined(attrs.vertical)?scope.$parent.$eval(attrs.vertical):false;return scope.justified=angular.isDefined(attrs.justified)?scope.$parent.$eval(attrs.justified):false}}));uiKatrid.directive("tab",["$parse",$parse=>({require:"^tabset",restrict:"EA",replace:true,template:`<a class="nav-item nav-link" href ng-click="select()" tab-heading-transclude ng-class="{active: active, disabled: disabled}">{{heading}}</a>`,transclude:true,scope:{active:"=?",heading:"@",onSelect:"&select",onDeselect:"&deselect"},controller(){},compile(elm,attrs,transclude){return function(scope,elm,attrs,tabsetCtrl){scope.$watch("active",function(active){if(active){tabsetCtrl.select(scope)}});scope.disabled=false;if(attrs.disabled){scope.$parent.$watch($parse(attrs.disabled),function(value){scope.disabled=!!value})}scope.select=function(){if(!scope.disabled){scope.active=true}};tabsetCtrl.addTab(scope);scope.$on("$destroy",function(){tabsetCtrl.removeTab(scope)});scope.$transcludeFn=transclude}}})]);uiKatrid.directive("tabHeadingTransclude",[()=>({restrict:"A",require:"^tab",link(scope,elm,attrs,tabCtrl){scope.$watch("headingElement",function(heading){if(heading){elm.html("");elm.append(heading)}})}})]);uiKatrid.directive("tabContentTransclude",function(){const isTabHeading=node=>node.tagName&&(node.hasAttribute("tab-heading")||node.hasAttribute("data-tab-heading")||node.tagName.toLowerCase()==="tab-heading"||node.tagName.toLowerCase()==="data-tab-heading");return{restrict:"A",require:"^tabset",link(scope,elm,attrs){const tab=scope.$eval(attrs.tabContentTransclude);tab.$transcludeFn(tab.$parent,function(contents){angular.forEach(contents,function(node){if(isTabHeading(node)){tab.headingElement=node}else{elm.append(node)}})})}}})}).call(this);(function(){let uiKatrid=Katrid.uiKatrid;uiKatrid.directive("inlineForm",$compile=>({restrict:"A",scope:{}}));class Grid{constructor($compile){this.restrict="E";this.replace=true;this.scope={};this.$compile=$compile}link(scope,element,attrs){let me=this;const field=scope.$parent.view.fields[attrs.name];scope.action=scope.$parent.action;scope.fieldName=attrs.name;scope.field=field;scope.records=[];scope.recordIndex=-1;scope._cachedViews={};scope._=scope.$parent._;scope._changeCount=0;scope.dataSet=[];scope.parent=scope.$parent;scope.model=new Katrid.Services.Model(field.model);scope.isList=true;if(attrs.inlineEditor==="tabular")scope.inline="tabular";else if(attrs.hasOwnProperty("inlineEditor"))scope.inline="inline";scope.getContext=function(){return{}};scope.$setDirty=function(){return{}};let dataSource=scope.dataSource=new Katrid.Data.DataSource(scope);dataSource.readonly=!_.isUndefined(attrs.readonly);let p=scope.$parent;while(p){if(p.dataSource){scope.dataSource.masterSource=p.dataSource;break}p=p.$parent}scope.dataSource.fieldName=scope.fieldName;scope.gridDialog=null;let gridEl=null;let lst=element.find("list");if(lst.length)scope.model.getFieldsInfo({view_type:"list"}).then(res=>{loadViews({list:{content:lst,fields:res.result}})});else{scope.model.loadViews().then(res=>{let fld=res.views.list.fields[scope.field.field];if(fld)fld.visible=false;loadViews(res.views);scope.$apply()})}let renderDialog=function(){let el;let html=scope._cachedViews.form.content;scope.view=scope._cachedViews.form;let fld=scope._cachedViews.form.fields[scope.field.field];if(fld)fld.visible=false;if(attrs.inline){el=me.$compile(html)(scope);gridEl.find(".inline-input-dialog").append(el)}else{html=$(Katrid.$templateCache.get("view.field.OneToManyField.Dialog").replace("\x3c!-- view content --\x3e",html));el=me.$compile(html)(scope);el.find("form").first().addClass("row")}scope.formElement=el.find("form").first();scope.form=scope.formElement.controller("form");scope.gridDialog=el;if(!attrs.inline){el.modal("show");el.on("hidden.bs.modal",function(){scope.record=null;scope.dataSource.state=Katrid.Data.DataSourceState.browsing;el.remove();scope.gridDialog=null;scope.recordIndex=-1;_destroyChildren()})}el.find(".modal-dialog").addClass("ng-form");const def=new $.Deferred;el.on("shown.bs.modal",()=>def.resolve());return def};let _destroyChildren=()=>{dataSource.children=[]};let loadViews=obj=>{scope._cachedViews=obj;scope.view=scope._cachedViews.list;let onclick="openItem($index)";if(scope.inline==="tabular")onclick="";else if(scope.inline==="inline")onclick="editItem($event, $index)";const html=Katrid.UI.Utils.Templates.renderGrid(scope,$(scope.view.content),attrs,onclick);gridEl=this.$compile(html)(scope);element.replaceWith(gridEl);return gridEl};scope.doViewAction=((viewAction,target,confirmation)=>scope.action._doViewAction(scope,viewAction,target,confirmation));let _cacheChildren=(fieldName,record,records)=>{record[fieldName]=records};scope._incChanges=(()=>{});scope.addItem=function(){scope.dataSource.insert();console.log(attrs.$attr.inlineEditor);if(attrs.$attr.inlineEditor)scope.records.push(scope.record);else return scope.showDialog()};scope.addRecord=function(rec){let record=Katrid.Data.createRecord({},scope.dataSource);for(let[k,v]of Object.entries(rec))record[k]=v;scope.records.push(record)};scope.cancelChanges=(()=>scope.dataSource.setState(Katrid.Data.DataSourceState.browsing));scope.openItem=(index=>{scope.showDialog(index);if(scope.parent.dataSource.changing&&!scope.dataSource.readonly){return scope.dataSource.edit()}});scope.editItem=((evt,index)=>{if(scope.$parent.dataSource.changing){scope.dataSource.recordIndex=index;scope.dataSource.edit();setTimeout(()=>{let el=$(evt.target).closest("td").find("input.form-control").focus();setTimeout(()=>el.select())},100)}});scope.removeItem=function(idx){const rec=scope.records[idx];scope.records.splice(idx,1);scope._incChanges();rec.$record.$delete()};scope.$set=((field,value)=>{const control=scope.form[field];control.$setViewValue(value);control.$render()});scope.save=function(){if(scope.inline)return;if(scope.recordIndex>-1){let rec=scope.record;scope.record=null;scope.records.splice(scope.recordIndex,1);setTimeout(()=>{scope.records.splice(scope.recordIndex,0,rec);scope.$apply()})}else if(scope.recordIndex===-1){scope.records.push(scope.record);scope.$parent.record[scope.fieldName]=scope.records}if(!scope.inline){scope.gridDialog.modal("toggle")}scope._incChanges()};let _loadChildFromCache=child=>{if(scope.record.hasOwnProperty(child.fieldName)){child.scope.records=scope.record[child.fieldName]}};scope.showDialog=function(index){let needToLoad=false;if(index!=null){scope.recordIndex=index;if(scope.records[index]&&!scope.records[index].$loaded){scope.dataSource.get(scope.records[index].id,0,false,index).then(res=>{res.$loaded=true;scope.records[index]=res;scope.dataSource.edit();let currentRecord=scope.record;if(res.id)for(let child of dataSource.children){child.scope.masterChanged(res.id).then(res=>{_cacheChildren(child.fieldName,currentRecord,res.data)})}})}else{needToLoad=true}}else scope.recordIndex=-1;let done=()=>{if(needToLoad){scope.record=scope.records[index];for(let child of dataSource.children)_loadChildFromCache(child);scope.$apply()}};if(scope._cachedViews.form){renderDialog().then(done)}else{scope.model.getViewInfo({view_type:"form"}).then(function(res){if(res.result){scope._cachedViews.form=res.result;return renderDialog().then(done)}})}};const masterChanged=scope.masterChanged=(key=>{scope.dataSet=[];scope._changeCount=0;scope.records=[];if(key!=null){const data={};data[field.field]=key;if(key)return scope.dataSource.search(data).finally(()=>scope.dataSource.state=Katrid.Data.DataSourceState.browsing)}});if(!scope.$parent.isList){dataSource.invalidate=masterChanged}}}uiKatrid.directive("grid",Grid)})();(function(){class BaseTemplate{getBreadcrumb(scope,viewType){let html=`<ol class="breadcrumb">`;let i=0;for(let h of Katrid.Actions.Action.history){if(i===0&&h.viewModes.length>1)html+=`<li><a href="javascript:void(0)" ng-click="action.backTo(0, 'list')">${h.info.display_name}</a></li>`;i++;if(Katrid.Actions.Action.history.length>i&&h.viewType==="form")html+=`<li><a href="javascript:void(0)" ng-click="action.backTo(${i-1})">${h.scope.record.display_name}</a></li>`}if(scope.action.viewType==="form")html+="<li>{{ record.display_name }}</li>";html+="</ol>";return html}getSettingsDropdown(viewType){if(viewType==="form"){return`<ul class="dropdown-menu pull-right">\n    <li>\n      <a href="javascript:void(0);" ng-click="action.showDefaultValueDialog()">${Katrid.i18n.gettext("Set Default")}</a>\n    </li>\n  </ul>`}}getSetDefaultValueDialog(){return;`  <div class="modal fade" id="set-default-value-dialog" tabindex="-1" role="dialog">\n    <div class="modal-dialog" role="document">\n      <div class="modal-content">\n        <div class="modal-header">\n          <button type="button" class="close" data-dismiss="modal" aria-label="${Katrid.i18n.gettext("Close")}"><span aria-hidden="true">&times;</span></button>\n          <h4 class="modal-title">${Katrid.i18n.gettext("Set Default")}</h4>\n        </div>\n        <div class="modal-body">\n          <select class="form-control" id="id-set-default-value">\n            <option ng-repeat="field in view.fields">{{ field.caption }} = {{ record[field.name] }}</option>\n          </select>\n          <div class="radio">\n            <label><input type="radio" name="public">${Katrid.i18n.gettext("Only me")}</label>\n          </div>\n          <div class="radio">\n            <label><input type="radio" name="public">${Katrid.i18n.gettext("All users")}</label>\n          </div>\n        </div>\n        <div class="modal-footer">\n          <button type="button" class="btn btn-primary">${Katrid.i18n.gettext("Save")}</button>\n          <button type="button" class="btn btn-default" data-dismiss="modal">${Katrid.i18n.gettext("Cancel")}</button>\n        </div>\n      </div>\n    </div>\n  </div>  `}getViewRenderer(viewType){return this[`render_${viewType}`]}getViewModesButtons(scope){const act=scope.action;const buttons={card:'<button class="btn btn-default" type="button" ng-click="action.setViewType(\'card\')"><i class="fa fa-th-large"></i></button>',list:'<button class="btn btn-default" type="button" ng-click="action.setViewType(\'list\')"><i class="fa fa-list"></i></button>',form:'<button class="btn btn-default" type="button" ng-click="action.setViewType(\'form\')"><i class="fa fa-edit"></i></button>',calendar:'<button class="btn btn-default" type="button" ng-click="action.setViewType(\'calendar\')"><i class="fa fa-calendar"></i></button>',chart:'<button class="btn btn-default" type="button" ng-click="action.setViewType(\'chart\')"><i class="fa fa-bar-chart-o"></i></button>'};return buttons}getViewButtons(scope){const act=scope.action;const buttons=this.getViewModesButtons(scope);const r=[];for(let vt of Array.from(act.viewModes)){r.push(buttons[vt])}return`<div class="btn-group">${r.join("")}</div>`}getFilterButtons(){return;`  <div class="btn-group search-view-more-area" ng-show="search.viewMoreButtons">\n    <div class="btn-group">\n      <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" type="button" aria-expanded="false"><span class="fa fa-filter"></span> ${Katrid.i18n.gettext("Filters")} <span class="caret"></span></button>\n      <ul class="dropdown-menu search-view-filter-menu">\n      </ul>\n    </div>\n    <div class="btn-group">\n      <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" type="button"><span class="fa fa-bars"></span> ${Katrid.i18n.gettext("Group By")} <span class="caret"></span></button>\n      <ul class="dropdown-menu search-view-groups-menu">\n      </ul>\n    </div>\n    <button class="btn btn-default"><span class="fa fa-star"></span> ${Katrid.i18n.gettext("Favorites")} <span class="caret"></span></button>\n  </div>  `}preRender_card(scope,html){const buttons=this.getViewButtons(scope);html=$(html);let el=html;html.children("field").remove();for(let field of Array.from(html.find("field"))){field=$(field);const name=$(field).attr("name");field.replaceWith(`{{ ::record.${name} }}`)}html=html.html();return`<div class="data-form">\n  <header class="data-heading panel panel-default">\n      <div class="panel-body">\n        <div class='row'>\n          <div class="col-sm-6">\n          <ol class="breadcrumb">\n            <li>{{ action.info.display_name }}</li>\n          </ol>\n          </div>\n          <search-view class="col-md-6"/>\n          \x3c!--<p class="help-block">{{ action.info.usage }}&nbsp;</p>--\x3e\n        </div>\n        <div class="row">\n        <div class="toolbar">\n  <div class="col-sm-6">\n          <button class="btn btn-primary" type="button" ng-click="action.createNew()">${Katrid.i18n.gettext("Create")}</button>\n          <span ng-show="dataSource.loading" class="badge page-badge-ref">{{dataSource.pageIndex}}</span>\n    <div class="btn-group">\n      <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">\n        ${Katrid.i18n.gettext("Action")} <span class="caret"></span></button>\n      <ul class="dropdown-menu">\n        <li><a href='javascript:void(0)' ng-click="action.deleteSelection()"><i class="fa fa-fw fa-trash-o"></i> ${Katrid.i18n.gettext("Delete")}</a></li>\n      </ul>\n    </div>\n  \n    \x3c!--button class="btn btn-default" ng-click="dataSource.refresh()"><i class="fa fa-refresh"></i> ${Katrid.i18n.gettext("Refresh")}</button--\x3e\n  \n  </div>\n  <div class="col-sm-6">\n  ${this.getFilterButtons()}\n    <div class="pull-right">\n              <div class="btn-group pagination-area">\n                <span class="paginator">{{dataSource.offset|number}} - {{dataSource.offsetLimit|number}}</span> / <span class="total-pages">{{ dataSource.recordCount|number }}</span>\n              </div>\n      <div class="btn-group">\n        <button class="btn btn-default" type="button" ng-click="dataSource.prevPage()"><i class="fa fa-chevron-left"></i>\n        </button>\n        <button class="btn btn-default" type="button" ng-click="dataSource.nextPage()"><i class="fa fa-chevron-right"></i>\n        </button>\n      </div>\n\n      ${buttons}\n  </div>\n  </div>\n  </div>\n  </div>\n      </header>\n  </div>\n  <div class="content-scroll">\n  <div class="content">\n  ${this.getCardView(scope,html,el)}\n  </div>\n  </div>\n  </div>\n  `}getCardView(scope,html,el){scope.defaultGrouping=$(el).data("grouping");scope.dataSource.autoLoadGrouping=true;if(_.isUndefined(scope.kanbanAddGroupItem)){scope.kanbanHideAddGroupItemDlg=(event=>{event.target.closest("#kanban-add-group-item-dlg").remove()});scope.kanbanShowAddGroupDlg=(event=>{angular.element(event.target).scope().kanbanAddGroupDlg=true;setTimeout(()=>{$(event.target).closest(".kanban-add-group").find("input").focus()},10)});scope.kanbanAddGroup=((event,name)=>{let gname=$(event.target).closest(".kanban-add-group").data("group-name");let field=scope.view.fields[gname];let svc=new Katrid.Services.Model(field.model);console.log("the name is",name);svc.createName(name).done(res=>{console.log(res)})});scope.kanbanAddItem=((event,name)=>{if(name){let ctx={};let g=$(event.target).closest(".kanban-group");ctx["default_"+g.data("group-name")]=g.data("sequence-id");scope.model.createName(name,ctx).done(res=>{if(res.ok){let id=res.result[0];scope.model.getById(id).done(res=>{if(res.ok){let s=angular.element(event.target).scope();let g=s.group;s.$apply(()=>{g.records.push(res.result.data[0])})}})}})}scope.kanbanHideAddGroupItemDlg(event)});scope.kanbanShowAddGroupItemDlg=(event=>{const templ=`\n          <form id="kanban-add-group-item-dlg" ng-submit="kanbanAddItem($event, kanbanNewName)">\n            <div class="form-group">\n              <input ng-model="kanbanNewName" ng-init="kanbanNewName = ''" class="form-control" ng-esc="kanbanHideAddGroupItemDlg($event)" placeholder="${Katrid.i18n.gettext("Add")}" ng-blur="kanbanHideAddGroupItemDlg($event)">\n            </div>\n            <button type="submit" class="btn btn-primary" onmousedown="event.preventDefault();event.stopPropagation();">${Katrid.i18n.gettext("Add")}</button>\n            <button class="btn btn-default">${Katrid.i18n.gettext("Cancel")}</button>\n          </form>\n          `;let s=angular.element(event.target).scope();let el=Katrid.core.compile(templ)(s);el=$(event.target).closest(".kanban-header").append(el);el.find("input").focus()})}const itemAttrs=`<div class="btn-group pull-right">\n        <button type="button" class="btn dropdown-toggle" data-toggle="dropdown">\n          <span class="caret"></span>\n        </button>\n        <ul class="dropdown-menu">\n          <li>\n            <a href="#">Move to next level</a>\n          </li>\n          <li>\n            <a href="#">Action 2</a>\n          </li>\n          <li>\n            <a href="#">Action 3</a>\n          </li>\n        </ul>\n      </div>`;let s='<div class="card-view kanban" ng-if="groupings.length" kanban-draggable=".kanban-group" kanban-group>';s+=`\n<div ng-repeat="group in groupings" class="kanban-group sortable-item" data-id="{{group._paramValue}}" data-group-name="{{group._paramName}}">\n  <div class="kanban-header margin-bottom-8">\n    <div class="pull-right">\n      <button class="btn" ng-click="kanbanShowAddGroupItemDlg($event)"><i class="fa fa-plus"></i></button>\n    </div>\n    <h4 ng-bind="group.__str__"></h4>\n    <div class="clearfix"></div>\n  </div>\n  <div class="kanban-items" kanban-draggable=".kanban-items" kanban-item>\n    <div ng-repeat="record in group.records" class="kanban-item sortable-item ui-sortable-handle" ng-click="action.listRowClick($index, record, $event)">\n      ${html}\n    </div>\n  </div>\n</div>\n<div class="kanban-add-group" title="${Katrid.i18n.gettext("Click here to add new column")}" ng-click="kanbanNewName='';kanbanShowAddGroupDlg($event);" data-group-name="{{groupings[0]._paramName}}">\n<div ng-hide="kanbanAddGroupDlg">\n  <i class="fa fa-fw fa-chevron-right fa-2x"></i>\n  <div class="clearfix"></div>\n  <span class="title">${Katrid.i18n.gettext("Add New Column")}</span>\n</div>\n<form ng-show="kanbanAddGroupDlg" ng-submit="kanbanAddGroup($event, kanbanNewName)">\n<div class="form-group">\n  <input class="form-control" ng-blur="kanbanAddGroupDlg=false" ng-esc="kanbanAddGroupDlg=false" placeholder="${Katrid.i18n.gettext("Add")}" ng-model="kanbanNewName">\n</div>\n  <button type="submit" class="btn btn-primary">${Katrid.i18n.gettext("Add")}</button>\n  <button type="button" class="btn btn-default">${Katrid.i18n.gettext("Cancel")}</button>\n</form>\n</div>\n\n</div><div class="card-view kanban" ng-if="!groupings.length">`;s+=`<div ng-repeat="record in records" class="panel panel-default card-item card-link" ng-click="action.listRowClick($index, record, $event)">\n        ${html}\n      </div>`;s+=`      <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            <div class="card-item card-ghost"></div>\n            </div>\n                  `;return s}preRender_toolbar(scope,viewType){const buttons=this.getViewButtons(scope);let actions="";if(scope.view.view_actions){for(let act of Array.from(scope.view.view_actions)){var confirmation;if(act.confirm){confirmation=`, '${act.confirm}'`}else{confirmation=", null"}if(act.prompt){confirmation+=`, '${act.prompt}'`}actions+=`<li><a href="javascript:void(0)" ng-click="action.doViewAction('${act.name}', record.id${confirmation})">${act.title}</a></li>`}}return;`  <div class="data-heading panel panel-default">\n      <div class="panel-body">\n        <div>\n          <a href="javascript:void(0)" title="Add to favorite"><i class="fa star fa-star-o pull-right"></i></a>\n          ${this.getBreadcrumb(scope)}\n          <p class="help-block">{{ ::action.info.usage }}</p>\n        </div>\n        <div class="toolbar">\n    <button class="btn btn-primary" type="button" ng-disabled="dataSource.uploading" ng-click="dataSource.saveChanges()" ng-show="dataSource.changing">${Katrid.i18n.gettext("Save")}</button>\n    <button class="btn btn-primary" type="button" ng-disabled="dataSource.uploading" ng-click="dataSource.editRecord()" ng-show="!dataSource.changing">${Katrid.i18n.gettext("Edit")}</button>\n    <button class="btn btn-default" type="button" ng-disabled="dataSource.uploading" ng-click="dataSource.newRecord()" ng-show="!dataSource.changing">${Katrid.i18n.gettext("Create")}</button>\n    <button class="btn btn-default" type="button" ng-click="dataSource.cancelChanges()" ng-show="dataSource.changing">${Katrid.i18n.gettext("Cancel")}</button>\n    <div class="btn-group">    \n      <div class="btn-group">\n        <button id="attachments-button" attachments-button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">\n          <span ng-show="!$parent.attachments.length">${Katrid.i18n.gettext("Attachments")}</span>\n          <span ng-show="$parent.attachments.length">{{ sprintf(gettext('%d Attachment(s)'), $parent.attachments.length) }}</span>\n          <span class="caret"></span>\n        </button>\n        <ul class="dropdown-menu attachments-menu">\n          <li ng-repeat="attachment in $parent.attachments">\n            <a href="{{ ::attachment.download_url }}">{{ ::attachment.name }} <span class="fa fa-trash-o pull-right" title="Delete this attachment" onclick="event.preventDefault();" ng-click="action.deleteAttachment($index);"></span></a>\n          </li>\n          <li role="separator" class="divider" ng-show="attachments.length"></li>\n          <li>\n            <a href="javascript:void(0)" onclick="$(this).next().click()">${Katrid.i18n.gettext("Add...")}</a>\n            <input type="file" class="input-file-hidden" multiple onchange="Katrid.Services.Attachments.upload(this)">\n          </li>\n        </ul>\n      </div>\n      <div class="btn-group">\n        <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">\n          ${Katrid.i18n.gettext("Action")} <span class="caret"></span></button>\n        <ul class="dropdown-menu dropdown-menu-actions">\n          <li><a href='javascript:void(0)' ng-click="action.deleteSelection(true)"><i class="fa fa-fw fa-trash-o"></i> ${Katrid.i18n.gettext("Delete")}</a></li>\n          <li><a href='javascript:void(0)' ng-click="action.copy()"><i class="fa fa-fw fa-files-o"></i> ${Katrid.i18n.gettext("Duplicate")}</a></li>\n          ${actions}\n        </ul>\n      </div>\n    </div>\n    <div class="pull-right">\n      <div class="btn-group pagination-area">\n          <span ng-show="records.length">\n            {{ dataSource.recordIndex }} / {{ records.length }}\n          </span>\n      </div>\n      <div class="btn-group" role="group">\n        <button class="btn btn-default" type="button" ng-click="dataSource.prior('form')"><i class="fa fa-chevron-left"></i>\n        </button>\n        <button class="btn btn-default" type="button" ng-click="dataSource.next('form')"><i class="fa fa-chevron-right"></i>\n        </button>\n      </div>\n\n      ${buttons}\n  </div>\n  </div>\n      </div>\n    </div>  `}preRender_form(scope,html,toolbar){if(toolbar==null){toolbar=true}if(toolbar){toolbar=this.preRender_toolbar(scope,"form")}else{toolbar=""}return;`  <div ng-form="form" class="data-form" ng-class="{'form-data-changing': dataSource.changing, 'form-data-readonly': !dataSource.changing}">\n  ${toolbar}\n  <div class="content-scroll"><div class="content">\n    <div class="clearfix"></div><header class="content-container-heading"></header><div class="clearfix"></div>  \n  <div class="content container">\n  <div class="panel panel-default data-panel browsing" ng-class="{ browsing: dataSource.browsing, editing: dataSource.changing }">\n  <div class="panel-body"><div class="row">${html}</div></div></div></div></div></div></div>`}preRender_list(scope,html){const reports=`  <div class="btn-group">\n    <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">\n      ${Katrid.i18n.gettext("Print")} <span class="caret"></span></button>\n    <ul class="dropdown-menu">\n      <li><a href='javascript:void(0)' ng-click="action.autoReport()"><i class="fa fa-fw fa-file"></i> ${Katrid.i18n.gettext("Auto Report")}</a></li>\n    </ul>\n  </div>  `;const buttons=this.getViewButtons(scope);let ret=`<div class="data-heading panel panel-default">\n    <div class="panel-body">\n      <div class='row'>\n        <div class="col-sm-6">\n          <ol class="breadcrumb">\n            <li>{{ action.info.display_name }}</li>\n          </ol>\n        </div>\n        <search-view class="col-md-6"/>\n        \x3c!--<p class="help-block">{{ action.info.usage }}&nbsp;</p>--\x3e\n      </div>\n      <div class="row">\n      <div class="toolbar">\n  <div class="col-sm-6">\n        <button class="btn btn-primary" type="button" ng-click="action.createNew()">${Katrid.i18n.gettext("Create")}</button>\n        <span ng-show="dataSource.loading" class="badge page-badge-ref">{{dataSource.pageIndex}}</span>\n  \n  ${reports}\n  <div class="btn-group" ng-show="action.selectionLength">\n    <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">\n      ${Katrid.i18n.gettext("Action")} <span class="caret"></span></button>\n    <ul class="dropdown-menu">\n      <li><a href='javascript:void(0)' ng-click="action.deleteSelection()"><i class="fa fa-fw fa-trash-o"></i> ${Katrid.i18n.gettext("Delete")}</a></li>\n    </ul>\n  </div>\n  \n  \x3c!--button class="btn btn-default" ng-click="dataSource.refresh()"><i class="fa fa-refresh"></i> ${Katrid.i18n.gettext("Refresh")}</button--\x3e\n  \n  </div>\n  <div class="col-sm-6">\n  ${this.getFilterButtons()}\n  \n  <div class="pull-right">\n            <div class="btn-group pagination-area">\n              <span class="paginator">{{dataSource.offset|number}} - {{dataSource.offsetLimit|number}}</span> / <span class="total-pages">{{dataSource.recordCount|number}}</span>\n            </div>\n    <div class="btn-group">\n      <button class="btn btn-default" type="button" ng-click="dataSource.prevPage()"><i class="fa fa-chevron-left"></i>\n      </button>\n      <button class="btn btn-default" type="button" ng-click="dataSource.nextPage()"><i class="fa fa-chevron-right"></i>\n      </button>\n    </div>\n\n    ${buttons}\n  </div>\n  </div>\n  </div>\n  </div>\n    </div>\n  </div>\n  <div class="content-scroll">\n  <div class="content no-padding">\n  <div class="panel-default data-panel">\n  <div class="panel-body no-padding">\n  <div class="dataTables_wrapper form-inline dt-bootstrap no-footer">${html}</div></div></div></div></div>`;return ret}static get cssListClass(){return"table table-striped table-bordered table-condensed table-hover display responsive nowrap dataTable no-footer dtr-column"}renderList(scope,element,attrs,rowClick,parentDataSource,showSelector=true){let ths='<th ng-show="dataSource.groups.length"></th>';let tfoot=false;let totals=[];let cols=`<td ng-show="dataSource.groups.length" class="group-header">\n  <div ng-show="record._group">\n  <span class="fa fa-fw fa-caret-right"\n    ng-class="{'fa-caret-down': record._group.expanded, 'fa-caret-right': record._group.collapsed}"></span>\n    {{::record._group.__str__}} ({{::record._group.count }})</div></td>`;if(showSelector){ths+=`<th class="list-record-selector"><input type="checkbox" ng-click="action.selectToggle($event.currentTarget)" onclick="$(this).closest('table').find('td.list-record-selector input').prop('checked', $(this).prop('checked'))"></th>`;cols+=`<td class="list-record-selector" onclick="event.stopPropagation();"><input title="teste" type="checkbox" ng-click="action.selectToggle($event.currentTarget)" onclick="if (!$(this).prop('checked')) $(this).closest('table').find('th.list-record-selector input').prop('checked', false)"></td>`}for(let col of Array.from(element.children())){let colHtml=col.outerHTML;col=$(col);let name=col.attr("name");if(!name){cols+=`<td>${col.html()}</td>`;ths+="<th><span>${col.attr('label')}</span></th>";continue}let total=col.attr("total");if(total){totals.push([name,total]);tfoot=true}else totals.push(total);name=col.attr("name");const fieldInfo=scope.view.fields[name];if(col.attr("visible")==="False"||fieldInfo.visible===false)continue;let _widget=fieldInfo.createWidget(col.attr("widget"),scope,col,col);_widget.inList=true;_widget.inplaceEditor=Boolean(scope.inline);ths+=_widget.th(col.attr("label"));cols+=_widget.td(scope.inline,colHtml,col)}if(parentDataSource){ths+='<th class="list-column-delete" ng-show="parent.dataSource.changing && !dataSource.readonly">';cols+='<td class="list-column-delete" ng-show="parent.dataSource.changing && !dataSource.readonly" ng-click="removeItem($index);$event.stopPropagation();"><i class="fa fa-trash-o"></i></td>'}if(rowClick==null){rowClick="action.listRowClick($index, row, $event)"}if(tfoot)tfoot=`<tfoot><tr>${totals.map(t=>t?`<td class="text-right"><strong><ng-total field="${t[0]}" type="${t[1]}"></ng-total></ strong></td>`:'<td class="borderless"></td>').join("")}</tr></tfoot>`;else tfoot="";let gridClass=" grid";if(scope.inline)gridClass+=" inline-editor";return`<table class="${this.constructor.cssListClass}${gridClass}">\n  <thead><tr>${ths}</tr></thead>\n  <tbody>\n  <tr ng-repeat="record in records" ng-click="${rowClick}" ng-class="{'group-header': record._hasGroup, 'form-data-changing': (dataSource.changing && dataSource.recordIndex === $index), 'form-data-readonly': !(dataSource.changing && dataSource.recordIndex === $index)}" ng-form="grid-row-form-{{$index}}" id="grid-row-form-{{$index}}">${cols}</tr>\n  </tbody>\n  ${tfoot}\n  </table>\n  `}renderGrid(scope,element,attrs,rowClick){const tbl=this.renderList(scope,element,attrs,rowClick,true,false);let buttons;if(attrs.inline=="inline")buttons=`<button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="parent.dataSource.changing && !dataSource.changing" type="button">${Katrid.i18n.gettext("Add")}</button><button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="dataSource.changing" type="button">${Katrid.i18n.gettext("Save")}</button><button class="btn btn-xs btn-info" ng-click="cancelChanges()" ng-show="dataSource.changing" type="button">${Katrid.i18n.gettext("Cancel")}</button>`;else buttons=`<button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="parent.dataSource.changing" type="button">${Katrid.i18n.gettext("Add")}</button>`;return`<div style="overflow-x: auto;"><div ng-show="!dataSource.readonly">\n  ${buttons}\n  </div><div class="row inline-input-dialog" ng-show="dataSource.changing"/>${tbl}</div>`}windowDialog(scope){console.log("window dialog",scope);return;`  <div class="modal fade" tabindex="-1" role="dialog">\n    <div class="modal-dialog modal-lg" role="document">\n      <div class="modal-content">\n        <div class="modal-header">\n          <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>\n          <h4 class="modal-title" id="myModalLabel">\n          {{dialogTitle}}\n          {{action.info.display_name}}</h4>\n        </div>\n        <div class="modal-body">\n    <div class="modal-dialog-body" ng-class="{'form-data-changing': dataSource.changing}"></div>\n  <div class="clearfix"></div>\n        </div>\n        <div class="modal-footer">\n          <button type="button" class="btn btn-primary" type="button" ng-click="dataSource.saveAndClose()" ng-show="dataSource.changing">${Katrid.i18n.gettext("Save")}</button>\n          <button type="button" class="btn btn-default" type="button" data-dismiss="modal" ng-show="dataSource.changing">${Katrid.i18n.gettext("Cancel")}</button>\n          <button type="button" class="btn btn-default" type="button" data-dismiss="modal" ng-show="!dataSource.changing">${Katrid.i18n.gettext("Close")}</button>\n        </div>\n      </div>\n    </div>\n  </div>  `}renderReportDialog(scope){return`<div ng-controller="ReportController">\n  <form id="report-form" method="get" action="/web/reports/report/">\n    <div class="data-heading panel panel-default">\n      <div class="panel-body">\n      <h2>{{ report.name }}</h3>\n      <div class="toolbar">\n        <button class="btn btn-primary" type="button" ng-click="report.preview()"><span class="fa fa-print fa-fw"></span> ${Katrid.i18n.gettext("Preview")}</button>\n  \n        <div class="btn-group">\n          <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"\n                  aria-expanded="false">${Katrid.i18n.gettext("Export")} <span class="caret"></span></button>\n          <ul class="dropdown-menu">\n            <li><a ng-click="Katrid.Reports.Reports.preview()">PDF</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('docx')">Word</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('xlsx')">Excel</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('pptx')">PowerPoint</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('csv')">CSV</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('txt')">${Katrid.i18n.gettext("Text File")}</a></li>\n          </ul>\n        </div>\n  \n        <div class="btn-group">\n          <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"\n                  aria-expanded="false">${Katrid.i18n.gettext("My reports")} <span class="caret"></span></button>\n          <ul class="dropdown-menu">\n            <li><a ng-click="Katrid.Reports.Reports.preview()">PDF</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('docx')">Word</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('xlsx')">Excel</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('pptx')">PowerPoint</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('csv')">CSV</a></li>\n            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('txt')">${Katrid.i18n.gettext("Text File")}</a></li>\n          </ul>\n        </div>\n  \n      <div class="pull-right btn-group">\n        <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"\n                aria-expanded="false"><i class="fa fa-gear fa-fw"></i></button>\n        <ul class="dropdown-menu">\n          <li><a href="javascript:void(0)" ng-click="report.saveDialog()">${Katrid.i18n.gettext("Save")}</a></li>\n          <li><a href="#">${Katrid.i18n.gettext("Load")}</a></li>\n        </ul>\n      </div>\n  \n      </div>\n    </div>\n    </div>\n    <div class="col-sm-12">\n      <table class="col-sm-12" style="margin-top: 20px; display:none;">\n        <tr>\n          <td colspan="2" style="padding-top: 8px;">\n            <label>${Katrid.i18n.gettext("My reports")}</label>\n  \n            <select class="form-control" ng-change="action.userReportChanged(action.userReport.id)" ng-model="action.userReport.id">\n                <option value=""></option>\n                <option ng-repeat="rep in userReports" value="{{ rep.id }}">{{ rep.name }}</option>\n            </select>\n          </td>\n        </tr>\n      </table>\n    </div>\n  <div id="report-params">\n  <div id="params-fields" class="col-sm-12 form-group">\n    <div class="checkbox"><label><input type="checkbox" ng-model="paramsAdvancedOptions"> ${Katrid.i18n.gettext("Advanced options")}</label></div>\n    <div ng-show="paramsAdvancedOptions">\n      <div class="form-group">\n        <label>${Katrid.i18n.gettext("Printable Fields")}</label>\n        <input type="hidden" id="report-id-fields"/>\n      </div>\n      <div class="form-group">\n        <label>${Katrid.i18n.gettext("Totalizing Fields")}</label>\n        <input type="hidden" id="report-id-totals"/>\n      </div>\n    </div>\n  </div>\n  \n  <div id="params-sorting" class="col-sm-12 form-group">\n    <label class="control-label">${Katrid.i18n.gettext("Sorting")}</label>\n    <select multiple id="report-id-sorting"></select>\n  </div>\n  \n  <div id="params-grouping" class="col-sm-12 form-group">\n    <label class="control-label">${Katrid.i18n.gettext("Grouping")}</label>\n    <select multiple id="report-id-grouping"></select>\n  </div>\n  \n  <div class="clearfix"></div>\n  \n  </div>\n    <hr>\n      <table class="col-sm-12">\n        <tr>\n          <td class="col-sm-4">\n            <select class="form-control" ng-model="newParam">\n              <option value="">--- ${Katrid.i18n.gettext("FILTERS")} ---</option>\n              <option ng-repeat="field in report.fields" value="{{ field.name }}">{{ field.label }}</option>\n            </select>\n          </td>\n          <td class="col-sm-8">\n            <button\n                class="btn btn-default" type="button"\n                ng-click="report.addParam(newParam)">\n              <i class="fa fa-plus fa-fw"></i> ${Katrid.i18n.gettext("Add Parameter")}\n            </button>\n          </td>\n        </tr>\n      </table>\n  <div class="clearfix"></div>\n  <hr>\n  <div id="params-params">\n    <div ng-repeat="param in report.params" ng-controller="ReportParamController" class="row form-group">\n      <div class="col-sm-12">\n      <div class="col-sm-4">\n        <label class="control-label">{{param.label}}</label>\n        <select ng-model="param.operation" class="form-control" ng-change="param.setOperation(param.operation)">\n          <option ng-repeat="op in param.operations" value="{{op.id}}">{{op.text}}</option>\n        </select>\n      </div>\n      <div class="col-sm-8" id="param-widget"></div>\n      </div>\n    </div>\n  </div>\n  </form>\n  </div>  `}renderStatusField(fieldName){return;`  <div class="status-field status-field-sm pull-right">\n    <input type="hidden" ng-model="self.${fieldName}"/>\n    <div class="steps">\n      <a ng-class="{active: $parent.$parent.record.${fieldName} === item[0]}" ng-repeat="item in choices">\n        <span ng-bind="item[1]"/>\n      </a>\n    </div>\n  </div>  `}}this.Katrid.UI.Utils={BaseTemplate:BaseTemplate,Templates:new BaseTemplate}}).call(this);(function(){Katrid.$hashId=0;_.mixin({hash(obj){if(!obj.$hashId){obj.$hashId=++Katrid.$hashId}return obj.$hashId}})}).call(this);(function(){let _counter=0;class Reports{static initClass(){this.currentReport={};this.currentUserReport={}}static get(repName){}static renderDialog(action){return Katrid.$templateCache.get("view.report")}}Reports.initClass();class Report{constructor(action,scope){this.action=action;this.scope=scope;this.info=this.action.info;Katrid.Reports.Reports.currentReport=this;if(Params.Labels==null){Params.Labels={exact:Katrid.i18n.gettext("Is equal"),in:Katrid.i18n.gettext("Selection"),contains:Katrid.i18n.gettext("Contains"),startswith:Katrid.i18n.gettext("Starting with"),endswith:Katrid.i18n.gettext("Ending with"),gt:Katrid.i18n.gettext("Greater-than"),lt:Katrid.i18n.gettext("Less-than"),between:Katrid.i18n.gettext("Between"),isnull:Katrid.i18n.gettext("Is Null")}}this.name=this.info.name;this.id=++_counter;this.values={};this.params=[];this.filters=[];this.groupables=[];this.sortables=[];this.totals=[]}getUserParams(){const report=this;const params={data:[],file:report.container.find("#id-report-file").val()};for(let p of Array.from(this.params)){params.data.push({name:p.name,op:p.operation,value1:p.value1,value2:p.value2,type:p.type})}const fields=report.container.find("#report-id-fields").val();params["fields"]=fields;const totals=report.container.find("#report-id-totals").val();params["totals"]=totals;const sorting=report.container.find("#report-id-sorting").val();params["sorting"]=sorting;const grouping=report.container.find("#report-id-grouping").val();params["grouping"]=grouping;return params}loadFromXml(xml){if(_.isString(xml)){xml=$(xml)}this.scope.customizableReport=xml.attr("customizableReport");this.scope.advancedOptions=xml.attr("advancedOptions");const fields=[];for(let f of Array.from(xml.find("field"))){f=$(f);const name=f.attr("name");const label=f.attr("label")||this.info.fields[name]&&this.info.fields[name].caption||name;const groupable=f.attr("groupable");const sortable=f.attr("sortable");const total=f.attr("total");const param=f.attr("param");const required=f.attr("required");const autoCreate=f.attr("autoCreate")||required;const operation=f.attr("operation");let type=f.attr("type");const modelChoices=f.attr("model-choices");if(!type&&modelChoices)type="ModelChoices";fields.push({name:name,label:label,groupable:groupable,sortable:sortable,total:total,param:param,required:required,operation:operation,modelChoices:modelChoices,type:type,autoCreate:autoCreate})}const params=Array.from(xml.find("param")).map(p=>$(p).attr("name"));return this.load(fields,params)}saveDialog(){const params=this.getUserParams();const name=window.prompt(Katrid.i18n.gettext("Report name"),Katrid.Reports.Reports.currentUserReport.name);if(name){Katrid.Reports.Reports.currentUserReport.name=name;$.ajax({type:"POST",url:this.container.find("#report-form").attr("action")+"?save="+name,contentType:"application/json; charset=utf-8",dataType:"json",data:JSON.stringify(params)})}return false}load(fields,params){if(!fields){({fields:fields}=this.info)}if(!params){params=[]}this.fields=fields;for(let p of fields){if(p.groupable)this.groupables.push(p);if(p.sortable)this.sortables.push(p);if(p.total)this.totals.push(p);if(!p.autoCreate)p.autoCreate=params.includes(p.name)}}loadParams(){for(let p of Array.from(this.fields))if(p.autoCreate)this.addParam(p.name)}addParam(paramName){for(let p of Array.from(this.fields))if(p.name===paramName){p=new Param(p,this);this.params.push(p);break}}getValues(){}export(format){if(format==null)format=localStorage.katridReportViewer||"pdf";const params=this.getUserParams();const svc=new Katrid.Services.Model("ir.action.report");svc.post("export_report",{args:[this.info.id],kwargs:{format:format,params:params}}).then(function(res){if(res.open){return window.open(res.open)}});return false}preview(){return this.export(localStorage.katridReportViewer)}renderFields(){let p;let el=$("<div></div>");const flds=this.fields.map(p=>`<option value="${p.name}">${p.label}</option>`).join("");const aggs=(()=>{const result1=[];for(p of Array.from(this.fields)){if(p.total){result1.push(`<option value="${p.name}">${p.label}</option>`)}}return result1})().join("");el=this.container.find("#report-params");let sel=el.find("#report-id-fields");sel.append($(flds)).select2({tags:(()=>{const result2=[];for(p of Array.from(this.fields))result2.push({id:p.name,text:p.label});return result2})()}).select2("container").find("ul.select2-choices").sortable({containment:"parent",start(){return sel.select2("onSortStart")},update(){return sel.select2("onSortEnd")}});if(Katrid.Reports.Reports.currentUserReport.params&&Katrid.Reports.Reports.currentUserReport.params.fields){console.log(Katrid.Reports.Reports.currentUserReport.params.fields);sel.select2("val",Katrid.Reports.Reports.currentUserReport.params.fields)}sel=el.find("#report-id-totals");sel.append(aggs).select2({tags:(()=>{const result3=[];for(p of Array.from(this.fields)){if(p.total){result3.push({id:p.name,text:p.label})}}return result3})()}).select2("container").find("ul.select2-choices").sortable({containment:"parent",start(){return sel.select2("onSortStart")},update(){return sel.select2("onSortEnd")}});return el}renderParams(container){let p;const el=$("<div></div>");this.elParams=el;const loaded={};const userParams=Katrid.Reports.Reports.currentUserReport.params;if(userParams&&userParams.data){for(p of Array.from(userParams.data)){loaded[p.name]=true;this.addParam(p.name,p.value)}}for(p of Array.from(this.params)){if(p.static&&!loaded[p.name]){$(p.render(el))}}return container.find("#params-params").append(el)}renderGrouping(container){const opts=Array.from(this.groupables).map(p=>`<option value="${p.name}">${p.label}</option>`).join("");const el=container.find("#params-grouping");const sel=el.find("select").select2();return sel.append(opts).select2("container").find("ul.select2-choices").sortable({containment:"parent",start(){return sel.select2("onSortStart")},update(){return sel.select2("onSortEnd")}})}renderSorting(container){const opts=Array.from(this.sortables).filter(p=>p.sortable).map(p=>`<option value="${p.name}">${p.label}</option>`).join("");const el=container.find("#params-sorting");const sel=el.find("select").select2();return sel.append(opts).select2("container").find("ul.select2-choices").sortable({containment:"parent",start(){return sel.select2("onSortStart")},update(){return sel.select2("onSortEnd")}})}render(container){this.container=container;let el=this.renderFields();if(this.sortables.length){el=this.renderSorting(container)}else{container.find("#params-sorting").hide()}if(this.groupables.length){el=this.renderGrouping(container)}else{container.find("#params-grouping").hide()}return el=this.renderParams(container)}}class Params{static initClass(){this.Operations={exact:"exact",in:"in",contains:"contains",startswith:"startswith",endswith:"endswith",gt:"gt",lt:"lt",between:"between",isnull:"isnull"};this.DefaultOperations={CharField:this.Operations.exact,IntegerField:this.Operations.exact,DateTimeField:this.Operations.between,DateField:this.Operations.between,FloatField:this.Operations.between,DecimalField:this.Operations.between,ForeignKey:this.Operations.exact,ModelChoices:this.Operations.exact};this.TypeOperations={CharField:[this.Operations.exact,this.Operations.in,this.Operations.contains,this.Operations.startswith,this.Operations.endswith,this.Operations.isnull],IntegerField:[this.Operations.exact,this.Operations.in,this.Operations.gt,this.Operations.lt,this.Operations.between,this.Operations.isnull],FloatField:[this.Operations.exact,this.Operations.in,this.Operations.gt,this.Operations.lt,this.Operations.between,this.Operations.isnull],DecimalField:[this.Operations.exact,this.Operations.in,this.Operations.gt,this.Operations.lt,this.Operations.between,this.Operations.isnull],DateTimeField:[this.Operations.exact,this.Operations.in,this.Operations.gt,this.Operations.lt,this.Operations.between,this.Operations.isnull],DateField:[this.Operations.exact,this.Operations.in,this.Operations.gt,this.Operations.lt,this.Operations.between,this.Operations.isnull],ForeignKey:[this.Operations.exact,this.Operations.in,this.Operations.isnull],ModelChoices:[this.Operations.exact,this.Operations.in,this.Operations.isnull]};this.Widgets={CharField(param){return`<div><input id="rep-param-id-${param.id}" ng-model="param.value1" type="text" class="form-control"></div>`},IntegerField(param){let secondField="";if(param.operation==="between"){secondField=`<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" ng-model="param.value2" type="text" class="form-control"></div>`}return`<div class="row"><div class="col-sm-6"><input id="rep-param-id-${param.id}" type="number" ng-model="param.value1" class="form-control"></div>${secondField}</div>`},DecimalField(param){let secondField="";if(param.operation==="between"){secondField=`<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" ng-model="param.value2" type="text" class="form-control"></div>`}return`<div class="col-sm-6"><input id="rep-param-id-${param.id}" type="number" ng-model="param.value1" class="form-control"></div>${secondField}`},DateTimeField(param){let secondField="";if(param.operation==="between"){secondField=`<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" type="datetime-local" ng-model="param.value2" class="form-control"></div>`}return`<div class="row"><div class="col-xs-6"><input id="rep-param-id-${param.id}" type="date" ng-model="param.value1" class="form-control"></div>${secondField}</div>`},DateField(param){let secondField="";if(param.operation==="between"){secondField=`<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" type="date" ng-model="param.value2" class="form-control"></div>`}return`<div class="col-sm-12 row"><div class="col-xs-6"><input id="rep-param-id-${param.id}" type="date" ng-model="param.value1" class="form-control"></div>${secondField}</div>`},ForeignKey(param){const serviceName=param.params.info.model;let multiple="";if(param.operation==="in"){multiple="multiple"}return`<div><input id="rep-param-id-${param.id}" ajax-choices="/api/rpc/${serviceName}/get_field_choices/" field="${param.name}" ng-model="param.value1" ${multiple}></div>`},ModelChoices(param){console.log("model choices",param);return`<div><input id="rep-param-id-${param.id}" ajax-choices="/api/reports/model/choices/" model-choices="${param.info.modelChoices}" ng-model="param.value1"></div>`}}}}Params.initClass();class Param{constructor(info,params){this.info=info;this.params=params;this.name=this.info.name;this.label=this.info.label;this.field=this.params.info.fields&&this.params.info.fields[this.name];this.static=this.info.param==="static"||this.field.param==="static";this.type=this.info.type||this.field&&this.field.type||"CharField";this.defaultOperation=this.info.default_operation||Params.DefaultOperations[this.type];this.operation=this.defaultOperation;this.operations=this.getOperations();this.exclude=this.info.exclude;this.id=++_counter}defaultValue(){return null}setOperation(op,focus){if(focus==null){focus=true}this.createControls(this.scope);const el=this.el.find(`#rep-param-id-${this.id}`);if(focus){el.focus()}}createControls(scope){const el=this.el.find(".param-widget");el.empty();let widget=Params.Widgets[this.type](this);widget=Katrid.core.compile(widget)(scope);return el.append(widget)}getOperations(){return Array.from(Params.TypeOperations[this.type]).map(op=>({id:op,text:Params.Labels[op]}))}operationTemplate(){const opts=this.getOperations();return`<div class="col-sm-4"><select id="param-op-${this.id}" ng-model="param.operation" ng-init="param.operation='${this.defaultOperation}'" class="form-control" onchange="$('#param-${this.id}').data('param').change();$('#rep-param-id-${this.id}')[0].focus()">\n  ${opts}\n  </select></div>`}template(){let operation="";if(!this.operation)operation=this.operationTemplate();return`<div id="param-${this.id}" class="row form-group" data-param="${this.name}" ng-controller="ParamController"><label class="control-label">${this.label}</label>${operation}<div id="param-widget-${this.id}"></div></div>`}render(container){this.el=this.params.scope.compile(this.template())(this.params.scope);this.el.data("param",this);this.createControls(this.el.scope());return container.append(this.el)}}Katrid.uiKatrid.controller("ReportController",function($scope,$element,$compile){const xmlReport=$scope.$parent.action.info.content;const report=new Report($scope.$parent.action,$scope);$scope.report=report;console.log(report);report.loadFromXml(xmlReport);report.render($element);return report.loadParams()});Katrid.uiKatrid.controller("ReportParamController",function($scope,$element){$scope.$parent.param.el=$element;$scope.$parent.param.scope=$scope;return $scope.$parent.param.setOperation($scope.$parent.param.operation,false)});class Telegram{static export(report,format){let templ=Katrid.$templateCache.get("reportbot.dilaog.contacts");let modal=$(templ);$("body").append(modal);let sel=modal.find("#id-reportbot-select-contacts");let contacts=new Katrid.Services.Model("res.partner").post("get_telegram_contacts").done(res=>{if(res)res.map(c=>sel.append(`<option value="${c[0]}">${c[1]}</option>`));sel.select2()});modal.find("#id-btn-ok").click(()=>{let svc=new Katrid.Services.Model("telegram.pending");format="pdf";const params=report.getUserParams();svc.post("export_report",{args:[report.info.id],kwargs:{contacts:sel.val(),format:format,params:params}}).done(function(res){if(res.ok)console.log("ok")})});modal.modal();return true}}this.Katrid.Reports={Reports:Reports,Report:Report,Telegram:Telegram,Param:Param}})();(()=>{let compileButtons=container=>{return container.find("button").each((idx,btn)=>{btn=$(btn);if(!btn.attr("type")||btn.attr("type")==="object")btn.attr("type","button");btn.attr("button-object",btn.attr("name"));btn.attr("ng-click",`action.formButtonClick(record.id, '${btn.attr("name")}', $event.target);$event.stopPropagation();`);if(!btn.attr("class"))btn.addClass("btn btn-outline-secondary")})};class ToolbarComponent extends Katrid.UI.Widgets.Component{constructor(){super();this.scope=false;this.restrict="E";this.replace=true;this.transclude=true;this.templateUrl="view.header"}}Katrid.uiKatrid.directive("toolbar",ToolbarComponent);class ClientView{constructor(action){this.action=action}get template(){return Katrid.$templateCache.get(this.templateUrl)}}class BaseView{constructor(scope){this.scope=scope}render(){return Katrid.$templateCache.get(this.templateUrl)}}class ActionView extends BaseView{constructor(action,scope,view,content){super(scope);this.action=action;this.view=view;this.templateUrl="view.basic";this.toolbar=true;this.content=content}getTemplateContext(){return{content:this.content}}render(){return sprintf(Katrid.$templateCache.get(this.templateUrl),this.getTemplateContext())}renderTo(parent){Katrid.core.setContent(this.render(),this.scope)}}class View extends ActionView{getBreadcrumb(){let html=`<ol class="breadcrumb">`;let i=0;for(let h of Katrid.Actions.actionManager.actions){if(i===0&&h.viewModes.length>1)html+=`<li class="breadcrumb-item"><a href="javascript:void(0)" ng-click="action.backTo(0, 0)">${h.info.display_name}</a></li>`;i++;if(Katrid.Actions.actionManager.actions.length>i&&h.viewType==="form")html+=`<li class="breadcrumb-item"><a href="javascript:void(0)" ng-click="action.backTo(${i-1}, 'form')">${h.scope.record.display_name}</a></li>`}if(this.constructor.type==="form")html+=`<li class="breadcrumb-item">{{ self.display_name }}</li>`;return html+"</ol>"}render(){return sprintf(Katrid.$templateCache.get(this.templateUrl),{content:this.content})}getViewButtons(){let btns=Object.entries(View.buttons).map(btn=>this.view.viewModes.includes(btn[0])?btn[1]:"").join("");if(btns)btns=`<div class="btn-group">${btns}</div>`;return btns}}class FormView extends View{constructor(action,scope,view,content){super(action,scope,view,content);this.templateUrl="view.form"}render(){let el=$(sprintf(Katrid.$templateCache.get(this.templateUrl),{content:this.content,breadcrumb:this.getBreadcrumb(),actions:""}));let frm=el.find("form").first().addClass("row");return el}}FormView.type="form";class ListView extends View{constructor(action,scope,view,content){super(action,scope,view,content);this.templateUrl="view.list"}render(){let el=$(super.render());let content=$(this.content);const showSelector=true;let ths=Katrid.$templateCache.get("view.list.th.group");let cols=Katrid.$templateCache.get("view.list.td.group");if(showSelector){ths+=Katrid.$templateCache.get("view.list.th.selector");cols+=Katrid.$templateCache.get("view.list.td.selector")}compileButtons(content);for(let col of content.children()){col=$(col);let html=col.html();let name=col.attr("name");if(!name){cols+=`<td>${html}</td>`;ths+=`<th><span>${col.attr("caption")||""}</span></th>`;continue}const fieldInfo=this.view.fields[name];if(!fieldInfo||col.attr("visible")==="False"||fieldInfo.visible===false)continue;if(html){cols+=`<td>${html}</td>`;ths+=`<th><span>${col.attr("caption")||fieldInfo.caption}</span></th>`;continue}if(fieldInfo.choices){fieldInfo._listChoices={};for(let choice of Array.from(fieldInfo.choices)){fieldInfo._listChoices[choice[0]]=choice[1]}}let _widget=Katrid.UI.Widgets[col.attr("widget")||fieldInfo.type]||Katrid.UI.Widgets.StringField;_widget=new _widget(this.scope,{},fieldInfo,col);_widget.inList=true;ths+=_widget.th();cols+=_widget.td()}el.find("#replace-ths").replaceWith(ths);el.find("#replace-cols").replaceWith(cols);return el.html()}}ListView.type="list";class CardView extends View{constructor(action,scope,view,content){super(action,scope,view,content);this.templateUrl="view.card"}render(){let content=$(this.content);let fieldList=Array.from(content.children("field")).map(el=>$(el).attr("name"));content.children("field").remove();content.find("field").each((idx,el)=>$(el).replaceWith(`{{ ::record.${$(el).attr("name")} }}`));console.log(this.content);return sprintf(Katrid.$templateCache.get(this.templateUrl),{content:content.html()})}}CardView.type="card";class Form{constructor(){this.restrict="E";this.scope=false}buildHeader(form){let newHeader=form.find("form header").first();form.find("form.full-width").closest(".container").removeClass("container").find(".card").first().addClass("full-width no-border");if(newHeader.length){let headerButtons=$('<div class="header-buttons"></div>');newHeader.prepend(headerButtons);compileButtons(newHeader).each((idx,btn)=>headerButtons.append(btn))}else newHeader=$("<header></header>");newHeader.addClass("content-container-heading");let header=form.find("header").first();header.replaceWith(newHeader);form.find("field[name=status]").prependTo(newHeader)}link(scope,element){element.find("form.full-width").closest(".container").removeClass("container").find(".card").first().addClass("full-width no-border");scope.$parent.formElement=element.find("form").first();scope.$parent.form=angular.element(scope.formElement).controller("form")}template(element,attrs){this.buildHeader(element);element.addClass("ng-form");return element.html()}}Katrid.uiKatrid.directive("formView",Form);Katrid.UI.Views={View:View,BaseView:BaseView,ActionView:ActionView,FormView:FormView,ListView:ListView,CardView:CardView,ClientView:ClientView,searchModes:[ListView.type,CardView.type]};Katrid.UI.Views[FormView.type]=FormView;Katrid.UI.Views[ListView.type]=ListView;Katrid.UI.Views[CardView.type]=CardView})();(function(){class Alerts{static success(msg){return toastr["success"](msg)}static warn(msg){return toastr["warning"](msg)}static error(msg){return toastr["error"](msg)}}class WaitDialog{static show(){$("#loading-msg").show()}static hide(){$("#loading-msg").hide()}}class Dialog extends Katrid.UI.Views.BaseView{constructor(scope,options,$compile){super(scope);this.$compile=$compile;this.templateUrl="dialog.base";this.scope.isDialog=true}render(){return $(sprintf(Katrid.$templateCache.get(this.templateUrl),{content:this.content}))}show(){if(!this.el){this.el=$(this.render());this.root=this.el.find(".modal-dialog-body");this.el.find("form").first().addClass("row");this.$compile(this.el)(this.scope)}this.el.modal("show").on("shown.bs.modal",()=>Katrid.uiKatrid.setFocus(this.el.find(".form-field").first()));return this.el}}class Window extends Dialog{constructor(scope,options,$compile){super(scope.$new(),options,$compile);this.templateUrl="dialog.window";console.log(Katrid.$templateCache.get(this.templateUrl));this.scope.parentAction=scope.action;console.log(options);this.scope.views={form:options.view};this.scope.title=options&&options.title||Katrid.i18n.gettext("Create: ");this.scope.view=options.view;this.content=options.view.content}}let showWindow=(scope,field,view,$compile,$controller)=>{const elScope=scope.$new();elScope.parentAction=scope.action;elScope.views={form:view};elScope.isDialog=true;elScope.dialogTitle=Katrid.i18n.gettext("Create: ");let el=$(Katrid.UI.Utils.Templates.windowDialog(elScope));elScope.root=el.find(".modal-dialog-body");$controller("ActionController",{$scope:elScope,action:{model:[null,field.model],action_type:"ir.action.window",view_mode:"form",view_type:"form",display_name:field.caption}});el=$compile(el)(elScope);el.modal("show").on("shown.bs.modal",()=>Katrid.uiKatrid.setFocus(el.find(".form-field").first()));return el};Katrid.Dialogs={Alerts:Alerts,WaitDialog:WaitDialog,Dialog:Dialog,Window:Window}}).call(this);(function(){let WIDGET_COUNT=0;let DEFAULT_COLS={BooleanField:3,DecimalField:3,FloatField:3,DateField:3,DateTimeField:3,IntegerField:3,SmallIntegerField:3,TimeField:3,CharField:3,OneToManyField:12};class Field{static get tag(){return"input"}constructor(scope,attrs,field,element){this.attrs=attrs;this.scope=scope;this.templAttrs={};this.wAttrs={};this.field=field;this.element=element;this.content=element.html();this.spanPrefix="";if(field.depends!=null&&field.depends.length)scope.dataSource.addFieldWatcher(field);if(attrs.ngShow)this.templAttrs["ng-show"]=attrs.ngShow;if(attrs.ngReadonly||field.readonly)this.templAttrs["ng-readonly"]=attrs.ngReadonly||field.readonly;if(field.attrs)for(let k of field.attrs){v=field.attrs[k];if(k.startsWith("container")||k==="ng-show"&&!attrs.ngShow){this.templAttrs[k]=v}}if(attrs.ngFieldChange){this.wAttrs["ng-change"]=attrs.ngFieldChange}let cols=attrs.cols;if(!cols){if(field.type==="CharField")if(field.max_length&&field.max_length<30)cols=3;if(!cols)cols=DEFAULT_COLS[field.type]||6}this.col=cols;this.classes=["form-field"];if(field.onchange)scope.$watch()}fieldChangeEvent(){}get caption(){return this.element.attr("label")||this.field.caption}renderTo(templTag,inplaceEditor=false,cls=""){let templAttrs=[];for(let[k,v]of Object.entries(this.templAttrs))templAttrs.push(k+"="+'"'+v+'"');if(inplaceEditor)return`<${templTag} class="${cls}" ${templAttrs.join("")}>${this.template(this.scope,this.element,this.attrs,this.field)}</${templTag}>`;return`<${templTag} class="${this.field.type} section-field-${this.field.name} form-group" ${templAttrs.join("")}>`+this.template(this.scope,this.element,this.attrs,this.field)+`</${templTag}>`}get ngModel(){return`record.${this.field.name}`}get id(){if(!this._id)this._id=++WIDGET_COUNT;return`katrid-input-${this._id.toString()}`}widgetAttrs(){let v;const r=this.wAttrs;if(this.field.required){r["required"]=null}r["ng-model"]=this.ngModel;if(this.field.attrs){for(let attr of Object.keys(this.field.attrs)){v=this.field.attrs[attr];if(!attr.startsWith("container-")&&attr!=="ng-show"&&attr!=="ng-readonly"){r[attr]=v}}}if(!_.isUndefined(this.attrs.$attr))for(let attr of Object.keys(this.attrs.$attr)){let attrName=this.attrs.$attr[attr];if(!attrName.startsWith("container-")&&attr!=="ngShow"&&attr!=="ngReadonly"){v=this.attrs[attr];if(attrName.startsWith("field-")){attrName=attrName.substr(6,attrName.length-6)}else if(attrName==="class")this.classes.push(v);r[attrName]=v}}if(this.attrs.readonly!=null||this.field.readonly)r["readonly"]="";if(this.classes)r["class"]=this.classes.join(" ");return r}_getWidgetAttrs(scope,el,attrs,field){let html="";const attributes=this.widgetAttrs(scope,el,attrs,field);for(let att in attributes){const v=attributes[att];html+=` ${att}`;if(v||v===false){if(_.isString(v)&&v.indexOf('"')>-1){html+=`='${v}'`}else{html+=`="${v}"`}}}if(this.placeholder)html+=` placeholder="${this.placeholder}" `;return html}innerHtml(){return""}labelTemplate(){const placeholder="";const label=this.caption;if(this.attrs.nolabel==="placeholder"){this.placeholder=label;return""}else if(!_.isUndefined(this.attrs.nolabel))return"";return`<label for="${this.id}" class="form-label">${label}</label>`}get emptyText(){if(this.inplaceEditor)return"";return"--"}get readOnlyClass(){if(this.inplaceEditor||this.spanPrefix==="::")return"grid-field-readonly";return"form-field-readonly"}spanTemplate(scope,el,attrs,field){return`<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}record.${this.field.name}.toString() || '${this.emptyText}' }}</span>`}widgetTemplate(){let html=`<${this.constructor.tag} id="${this.id}" name="${this.field.name}" ${this._getWidgetAttrs()}>`;const inner=this.innerHtml();if(inner)html+=inner+`</${this.constructor.tag}>`;return html}template(){let label="";let span=this.spanTemplate();if(!this.inplaceEditor){label=this.labelTemplate()}let widget=this.widgetTemplate();if(this.inline==="inline")widget=`<div ng-if="dataSource.changing && dataSource.recordIndex === $index">${widget}</div>`;return`<div>${label}${span}${widget}</div>`}link(scope,el,attrs,$compile,field){if(field.depends){return(()=>{const result=[];for(let dep of Array.from(field.depends)){if(!Array.from(scope.dataSource.fieldChangeWatchers).includes(dep)){scope.dataSource.fieldChangeWatchers.push(dep);result.push(scope.$watch(`record.${dep}`,function(newValue,oldValue){if(newValue!==oldValue&&scope.dataSource.changing){return scope.model.onFieldChange(dep,scope.record).done(scope.dataSource.onFieldChange)}}))}}return result})()}}th(){let cls=`${this.field.type} list-column`;let lbl=this.element.attr("label")||`{{view.fields.${this.field.name}.caption}}`;return`<th class="${cls}" name="${this.field.name}"><span>${lbl}</span></th>`}_gridEditor(cls){return this.renderTo("section",true,cls)}_tdContent(){return this.spanTemplate()}_td(cls){let content;if(this.inplaceEditor)content=this._gridEditor(cls);else{this.spanPrefix="::";content=this.spanTemplate()}return`<td class="${cls}">${content}</td>`}td(){if(this.content)return this.content;return this._td(`${this.field.type} field-${this.field.name}`);let colHtml=this.element.html();let s;let fieldInfo=this.field;let name=fieldInfo.name;let editor="";if(gridEditor==="tabular"&&html)editor=html;if(colHtml){s=`<td><a data-id="{{::record.${name}[0]}}">${colHtml}</a>${editor}</td>`}else if(fieldInfo.type==="ForeignKey"){s=`<td><a data-id="{{::row.${name}[0]}}">{{row.${name}[1]}}</a>${editor}</td>`}else if(fieldInfo._listChoices){s=`<td class="${cls}">{{::view.fields.${name}._listChoices[row.${name}]}}${editor}</td>`}else if(fieldInfo.type==="BooleanField"){s=`<td class="bool-text ${cls}">{{::row.${name} ? '${Katrid.i18n.gettext("yes")}' : '${Katrid.i18n.gettext("no")}'}}${editor}</td>`}else if(fieldInfo.type==="IntegerField"){s=`<td class="${cls}">{{::row.${name}|number}}${editor}</td>`}else if(fieldInfo.type==="DecimalField"){let decimalPlaces=this.element.attr("decimal-places")||2;s=`<td class="${cls}">{{::row.${name}|number:${decimalPlaces} }}${editor}</td>`}else if(fieldInfo.type==="DateField"){s=`<td class="${cls}">{{::row.${name}|date:'${Katrid.i18n.gettext("yyyy-mm-dd").replace(/[m]/g,"M")}'}}${editor}</td>`}else if(fieldInfo.type==="DateTimeField"){s=`<td class="${cls}">{{::row.${name}|date:'${Katrid.i18n.gettext("yyyy-mm-dd").replace(/[m]/g,"M")}'}}${editor}</td>`}else{s=`<td>{{ ::row.${name} }}</td>`}return s}}class InputWidget extends Field{static get tag(){return"input input-field"}constructor(){super(...arguments);this.classes.push("form-control")}get type(){return"text"}widgetTemplate1(){let html;if(this.constructor.tag.startsWith("input")){html=`<${this.tag} id="${attrs._id}" type="${type}" name="${attrs.name}" ${this._getWidgetAttrs(scope,el,attrs,field)}>`}else{html=`<${this.tag} id="${attrs._id}" name="${attrs.name}" ${this._getWidgetAttrs(scope,el,attrs,field)}>`}const inner=this.innerHtml(scope,el,attrs,field);if(inner){html+=inner+`</${this.tag}>`}return html}widgetTemplate(){let type=this.type;const prependIcon=this.attrs.icon;let html=`<${this.constructor.tag} id="${this.id}" type="${this.type}" name="${this.field.name}" ${this._getWidgetAttrs()}>`;if(prependIcon)return`<label class="prepend-icon"><i class="icon ${prependIcon}"></i>${html}</label>`;const inner=this.innerHtml();if(inner)html+=inner+`</${this.constructor.tag}>`;return html}}class StringField extends InputWidget{widgetAttrs(){const attributes=super.widgetAttrs();if(this.field.maxLength)attributes["maxlength"]=this.field.maxLength.toString();return attributes}}class NumericField extends InputWidget{static get tag(){return"input decimal"}get type(){if(Katrid.Settings.UI.isMobile)return"number";return"text"}spanTemplate(){return`<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|number) || '${this.emptyText}' }}</span>`}}class IntegerField extends NumericField{static get tag(){return'input decimal decimal-places="0"'}}class TimeField extends InputWidget{get type(){return"time"}}class SelectionField extends InputWidget{static get tag(){return"select"}spanTemplate(){return`<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}view.fields.${this.field.name}.displayChoices[record.${this.field.name}] || '${this.emptyText}' }}</span>`}innerHtml(){return`<option ng-repeat="choice in view.fields.${this.field.name}.choices" value="{{choice[0]}}">{{choice[1]}}</option>`}}class ForeignKey extends Field{static get tag(){return"input foreignkey"}spanTemplate(){let allowOpen=true;if(this.attrs.allowOpen!=null&&this.attrs.allowOpen==="false"||this.attrs.allowOpen==null&&this.field.attrs&&this.field.attrs["allow-open"]===false)allowOpen=false;if(!allowOpen||this.inList)return`<span class="${this.readOnlyClass}"><a href="javascript:void(0)">{{ ${this.spanPrefix}record.${this.field.name}[1] || '${this.emptyText}' }}</a></span>`;return`<span class="${this.readOnlyClass}"><a href="#/action/${this.field.model}/view/?id={{ ${this.spanPrefix}record.${this.field.name}[0] }}" ng-click="action.openObject('${this.field.model}', record.${this.field.name}[0], $event, '${this.field.caption}')">{{ ${this.spanPrefix}record.${this.field.name}[1] }}</a><span ng-if="!record.${this.field.name}[1]">--</span></span>`}get type(){return"hidden"}_tdContent(){return`{{record.${this.field.name}[1]}}`}}class TextField extends StringField{static get tag(){return"textarea"}}class FloatField extends NumericField{static get tag(){if(Katrid.Settings.UI.isMobile)return"input";return"input decimal"}get type(){if(Katrid.Settings.UI.isMobile)return"number";return"text"}spanTemplate(){let decimalPlaces=this.attrs.decimalPlaces||2;return`<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|number:${decimalPlaces}) || '${this.emptyText}' }}</span>`}_tdContent(){let filter;let decimalPlaces=this.element.attr("decimal-places");if(decimalPlaces)filter`number:${decimalPlaces}`;else filter=`numberFormat:${this.element.attr("max-digits")||6}`;return`{{::record.${this.field.name}|${filter} }}`}}class DecimalField extends FloatField{spanTemplate(){let maxDigits=this.attrs.maxDigits;let fmt="number";if(maxDigits)fmt="numberFormat";else maxDigits=this.attrs.decimalPlaces||2;return`<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|${fmt}:${maxDigits}) || '${this.emptyText}' }}</span>`}_tdContent(cls){let maxDigits=this.element.attr("max-digits");if(maxDigits)return`<td class="${cls}">{{::record.${this.field.name}|numberFormat:${maxDigits} }}${this._gridEditor()}</td>`;else{maxDigits=2;return`{{::record.${this.field.name}|number:${maxDigits} }}`}}}class DateField extends TextField{static get tag(){return"input date-input"}get type(){return"date"}spanTemplate(){return`<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|date:'${Katrid.i18n.gettext("yyyy-mm-dd").replace(/[m]/g,"M")}') || '${this.emptyText}' }}</span>`}_tdContent(cls){return`{{::record.${this.field.name}|date:'${Katrid.i18n.gettext("yyyy-MM-dd")}'}}`}}class DateTimeField extends TextField{static get tag(){return"input date-input"}get type(){return"datetime-local"}spanTemplate(){return`<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|date:'${Katrid.i18n.gettext("yyyy-MM-dd hh:mma")}') || '${this.emptyText}' }}</span>`}}class OneToManyField extends Field{static get tag(){return"grid"}spanTemplate(){return""}innerHtml(){return this.content;let html=his.element.html();if(html)return html;return""}}class ManyToManyField extends Field{static get tag(){return"input foreignkey multiple"}spanTemplate(){return`<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}record.${this.field.name}|m2m }}</span>`}get type(){return"hidden"}}class BooleanField extends InputWidget{spanTemplate(){return`<span class="${this.readOnlyClass} bool-text">\n  {{${this.spanPrefix}record.${this.field.name} ? '${Katrid.i18n.gettext("yes")}' : '${Katrid.i18n.gettext("no")}'}}\n  </span>`}get type(){return"checkbox"}_td(cls){return super._td("bool-text "+cls)}widgetTemplate(){let html=super.widgetTemplate();html=`<label class="checkbox" ng-show="dataSource.changing">${html}`;if(this.field.help_text){html+=this.field.help_text}else{html+=this.field.caption}html+="<i></i></label>";return html}labelTemplate(){if(this.field.help_text)return super.labelTemplate();return`<label for="${this.id}" class="form-label form-label-checkbox"><span>${this.caption}</span>&nbsp;</label>`}}class FileField extends InputWidget{static get tag(){return"input file-reader"}get type(){return"file"}}class ImageField extends FileField{static get tag(){return'input file-reader accept="image/*"'}spanTemplate(){return""}widgetTemplate(){let html=super.widgetTemplate();let imgSrc=this.attrs.ngEmptyImage||this.attrs.emptyImage&&"'"+this.attrs.emptyImage+"'"||"'/static/web/static/assets/img/no-image.png'";html=`<div class="image-box image-field">\n  <img ng-src="{{ record.${this.field.name} || ${imgSrc} }}" />\n    <div class="text-right image-box-buttons">\n    <button class="btn btn-default" type="button" title="${Katrid.i18n.gettext("Change")}" onclick="$(this).closest('.image-box').find('input').trigger('click')"><i class="fa fa-pencil"></i></button>\n    <button class="btn btn-default" type="button" title="${Katrid.i18n.gettext("Clear")}" ng-click="$set('${this.field.name}', null)"><i class="fa fa-trash"></i></button>\n    </div>\n      ${html}</div>`;return html}}class PasswordField extends InputWidget{get type(){return"password"}spanTemplate(){return`<span class="form-field-readonly">*******************</span>`}}class StatusField extends InputWidget{constructor(...args){super(...args);this.col=null}static get tag(){return"status-field"}get type(){return"hidden"}renderTo(){return`<status-field id="${this.id}" name="${this.field.name}" ng-model="record.${this.field.name}"/>`}}Object.assign(this.Katrid.UI.Widgets,{Field:Field,InputWidget:InputWidget,StringField:StringField,IntegerField:IntegerField,SelectionField:SelectionField,ForeignKey:ForeignKey,TextField:TextField,DecimalField:DecimalField,FloatField:FloatField,DateField:DateField,DateTimeField:DateTimeField,TimeField:TimeField,BooleanField:BooleanField,OneToManyField:OneToManyField,ManyToManyField:ManyToManyField,FileField:FileField,PasswordField:PasswordField,ImageField:ImageField,StatusField:StatusField})})();(function(){let conditionsLabels={"=":Katrid.i18n.gettext("Is equal"),"!=":Katrid.i18n.gettext("Is different"),">":Katrid.i18n.gettext("Greater-than"),"<":Katrid.i18n.gettext("Less-than")};let conditionSuffix={"=":"","!=":"__isnot",like:"__icontains","not like":"__not_icontains",">":"__gt",">=":"__gte","<":"__lt","<=":"__lte",in:"__in","not in":"__not_in"};class SearchMenu{constructor(element,parent,options){this.element=element;this.parent=parent;this.options=options;this.input=this.parent.find(".search-view-input");this.input.on("input",evt=>{if(this.input.val().length){return this.show()}else{return this.close()}}).on("keydown",evt=>{switch(evt.which){case $.ui.keyCode.BACKSPACE:if(this.input.val()===""){const item=this.searchView.query.items[this.searchView.query.items.length-1];this.searchView.onRemoveItem(evt,item)}break}}).on("blur",evt=>{this.input.val("");return this.close()})}link(){return this.element.hide()}show(){this.element.show();return this.searchView.first()}close(){this.element.hide();this.reset()}async expand(item){let res=await this.searchView.scope.model.getFieldChoices(item.ref.name,this.searchView.scope.search.text);console.log(res);return res.items.map(obj=>this.searchView.loadItem(item.item,obj,item))}collapse(item){for(let i of Array.from(item.children)){i.destroy()}return item.children=[]}reset(){for(let i of this.searchView.items)if(i.children){this.collapse(i);i.reset()}}select(evt,item){if(this.options.select){if(item.parentItem){item.parentItem.value=item.value;item=item.parentItem}item.searchString=this.input.val();this.options.select(evt,item);return this.input.val("")}}}class SearchQuery{constructor(searchView){this.searchView=searchView;this.items=[];this.groups=[]}add(item){if(this.items.includes(item)){item.facet.addValue(item);item.facet.refresh()}else{this.items.push(item);this.searchView.renderFacets()}if(item instanceof SearchGroup)this.groups.push(item);this.searchView.change()}loadItem(item){this.items.push(item);if(item instanceof SearchGroup)this.groups.push(item)}remove(item){this.items.splice(this.items.indexOf(item),1);if(item instanceof SearchGroup){this.groups.splice(this.groups.indexOf(item),1)}this.searchView.change()}getParams(){let r=[];for(let i of this.items)r=r.concat(i.getParamValues());return r}}class FacetView{constructor(item){this.item=item;this.values=[]}init(item,values){this.item=item;if(values)this.values=values;else this.values=[{searchString:this.item.getDisplayValue(),value:this.item.value}]}addValue(item){this.item=item;return this.values.push({searchString:this.item.getDisplayValue(),value:this.item.value})}templateValue(){const sep=` <span class="facet-values-separator">${Katrid.i18n.gettext("or")}</span> `;return Array.from(this.values).map(s=>s.searchString).join(sep)}link(searchView){const html=$(this.template());this.item.facet=this;this.element=html;const rm=html.find(".facet-remove");rm.click(evt=>searchView.onRemoveItem(evt,this.item));return html}refresh(){return this.element.find(".facet-value").html(this.templateValue())}load(searchView){searchView.query.loadItem(this.item);this.render(searchView)}destroy(){this.item.clear()}getParamValues(){const r=[];for(let v of this.values){r.push(this.item.getParamValue(this.item.name,v))}if(r.length>1){return[{OR:r}]}return r}}class _SearchItem{constructor(name,item,parent,ref,menu){this.name=name;this.item=item;this.parent=parent;this.ref=ref;this.menu=menu;this.label=this.item.attr("label")||this.ref&&this.ref["caption"]||this.name}templateLabel(){return sprintf(Katrid.i18n.gettext(`Search <i>%(caption)s</i> by: <strong>%(text)s</strong>`),{caption:this.label,text:"{{search.text}}"})}template(){let s="";if(this.expandable)s=`<a class="expandable" href="#"></a>`;if(this.value)s=`<a class="search-menu-item indent" href="#">${this.value[1]}</a>`;else s+=`<a href="#" class="search-menu-item">${this.templateLabel()}</a>`;return`<li>${s}</li>`}link(action,$compile,parent){const html=$compile(this.template())(action);if(parent!=null){html.insertAfter(parent.element);parent.children.push(this);this.parentItem=parent}else html.appendTo(this.parent);this.element=html;this.itemEl=html.find(".search-menu-item").click(evt=>evt.preventDefault()).mousedown(evt=>{return this.select(evt)}).mouseover(function(evt){const el=html.parent().find(">li.active");if(el!==html){el.removeClass("active");return html.addClass("active")}});this.element.data("searchItem",this);this.expand=html.find(".expandable").on("mousedown",evt=>{this.expanded=!this.expanded;evt.stopPropagation();evt.preventDefault();$(evt.target).toggleClass("expandable expanded");if(this.expanded){return this.searchView.menu.expand(this)}else{return this.searchView.menu.collapse(this)}}).click(evt=>evt.preventDefault());return false}select(evt){if(evt){evt.stopPropagation();evt.preventDefault()}this.menu.select(evt,this);return this.menu.close()}getFacetLabel(){return this.label}getDisplayValue(){if(this.value){return this.value[1]}return this.searchString}getValue(){return this.facet.values.map(s=>s.value||s.searchString)}getParamValue(name,value){const r={};if($.isArray(value)){r[name]=value[0]}else{r[name+"__icontains"]=value}return r}getParamValues(){const r=[];for(let v of Array.from(this.getValue())){r.push(this.getParamValue(this.name,v))}if(r.length>1){return[{OR:r}]}return r}destroy(){return this.element.remove()}remove(){this.searchView.removeItem(this)}reset(){this.expanded=false;this.expand.removeClass("expanded");return this.expand.addClass("expandable")}onSelect(){}onRemove(){this.facet.element.remove();delete this.facet}}class SearchField extends _SearchItem{constructor(name,item,parent,ref,menu){super(name,item,parent,ref,menu);if(ref.type==="ForeignKey"){this.expandable=true;this.children=[]}else{this.expandable=false}}}class _SearchFilter extends _SearchItem{constructor(name,item,parent,ref,menu){super(name,item,parent,ref,menu);this.domain=JSON.parse(item.attr("domain").replace(/'/g,'"'))}link(scope,$compile,parent){const ul=this.searchView.toolbar.find(".search-view-filter-menu");let el=$(`<a class="dropdown-item" href="javascript:void(0)">${this.label}</a>`);this._toggleMenuEl=el;let me=this;el.click(function(evt){evt.preventDefault();let e=$(this);if(me.facet)me.remove();else me.select()});return ul.append(el)}select(el){super.select(null)}getFacetLabel(){return'<span class="fa fa-filter"></span>'}getDisplayValue(){return this.label}onSelect(){this._toggleMenuEl.addClass("selected")}onRemove(){this._toggleMenuEl.removeClass("selected");super.onRemove()}getParamValue(){return this.domain}}class SearchGroup extends _SearchItem{constructor(name,item,parent,ref,menu){super(name,item,parent,ref,menu);const ctx=item.attr("context");if(typeof ctx==="string"){this.context=JSON.parse(ctx)}else{this.context={grouping:[name]}}}getFacetLabel(){return'<span class="fa fa-bars"></span>'}templateLabel(){return Katrid.i18n.gettext("Group by:")+" "+this.label}getDisplayValue(){return this.label}}class SearchView1 extends Katrid.UI.Widgets.Widget{constructor(scope){super(scope);this.action=scope.action;scope.search={};this.inputKeyDown=this.inputKeyDown.bind(this);this.onSelectItem=this.onSelectItem.bind(this);this.onRemoveItem=this.onRemoveItem.bind(this);this.scope=scope;this.query=new SearchQuery(this);this.items=[];this.filters=[];this.action.searchView=this}createMenu(scope,el,parent){const menu=new SearchMenu(el,parent,{select:this.onSelectItem});menu.searchView=this;return menu}template(){return Katrid.$templateCache.get("view.search")}inputKeyDown(ev){switch(ev.keyCode){case Katrid.UI.Keyboard.keyCode.DOWN:this.move(1);ev.preventDefault();break;case Katrid.UI.Keyboard.keyCode.UP:this.move(-1);ev.preventDefault();break;case Katrid.UI.Keyboard.keyCode.ENTER:this.selectItem(ev,this.element.find(".search-view-menu > li.active"));break}}move(distance){const fw=distance>0;distance=Math.abs(distance);while(distance!==0){distance--;let el=this.element.find(".search-view-menu > li.active");if(el.length){el.removeClass("active");if(fw){el=el.next()}else{el=el.prev()}el.addClass("active")}else{if(fw){el=this.element.find(".search-view-menu > li").first()}else{el=this.element.find(".search-view-menu > li").last()}el.addClass("active")}}}selectItem(ev,el){el.data("searchItem").select(ev)}link(scope,el,attrs,controller,$compile){let html=el;html.addClass(attrs.class);this.$compile=$compile;this.view=scope.views.search;this.viewContent=$(this.view.content);this.element=html;this.toolbar=this.element.closest(".data-heading").find(".toolbar").first();this.searchView=html.find(".search-view");this.searchView.find(".search-view-input").keydown(this.inputKeyDown);let btnViewMore=html.find(".search-view-more");btnViewMore.click(evt=>{Katrid.localSettings.searchMenuVisible=!Katrid.localSettings.searchMenuVisible;this.scope.$apply(()=>this.scope.search.viewMoreButtons=Katrid.localSettings.searchMenuVisible)});this.menu=this.createMenu(scope,html.find(".search-dropdown-menu.search-view-menu"),html);this.menu.searchView=this;this.menu.link();this.menu.input.on("keydown",function(evt){});this.scope.search.viewMoreButtons=Katrid.localSettings.searchMenuVisible;for(let item of Array.from(this.viewContent.children()))this.loadItem($(item))}loadItem(item,value,parent,cls){console.log("load item",item,value);const tag=item.prop("tagName");if(cls==null){if(tag==="FIELD"){cls=SearchField}else if(tag==="FILTER"){cls=SearchFilter}else if(tag==="GROUP"){for(let grouping of Array.from(item.children())){this.loadItem($(grouping),null,null,SearchGroup)}return}}const name=item.attr("name");item=new cls(name,item,this.menu.element,this.view.fields[name],this.menu);item.id=this.items.length;item.searchView=this;if(value){item.expandable=false;item.value=value}item.link(this.scope,this.$compile,parent);this.items.push(item)}dump(){return this.query.items}load(items){for(let i of items)new FacetView(this.items[i.id],i.facet.values).load(this)}renderFacets(){for(let item of this.query.items)if(!item.facet)new FacetView(item).render(this)}first(){this.element.find(".search-view-menu > li.active").removeClass("active");return this.element.find(".search-view-menu > li").first().addClass("active")}onSelectItem(evt,obj){return this.query.add(obj)}onRemoveItem(evt,obj){return this.query.remove(obj)}removeItem(obj){this.query.remove(obj)}change(){if(this.query.groups.length||this.scope.dataSource.groups&&this.scope.dataSource.groups.length){this.scope.action.applyGroups(this.query.groups)}if(this.query.groups.length===0){return this.scope.action.setSearchParams(this.query.getParams())}}}class SearchItem{constructor(view,name,el){this.view=view;this.name=name;this.el=el}getDisplayValue(){if(this.value){return this.value[1]}return this.searchString}getParamValue(name,value){const r={};if(_.isArray(value)){r[name]=value[0]}else{r[name+"__icontains"]=value}return r}_doChange(){this.view.update()}}class SearchFilter extends SearchItem{constructor(view,name,label,domain,group,el){super(view,name,el);this.group=group;this.label=label;if(_.isString(domain))domain=JSON.parse(domain.replace(/'/g,'"'));this.domain=domain;this._selected=false}static fromItem(view,el,group){return new SearchFilter(view,el.attr("name"),el.attr("label"),el.attr("domain"),group,el)}toString(){return this.label}toggle(){this.selected=!this.selected}get selected(){return this._selected}set selected(value){this._selected=value;if(value)this.group.addValue(this);else this.group.removeValue(this);this._doChange()}getDisplayValue(){return this.label}get facet(){return this.group.facet}getParamValue(){return this.domain}get value(){return this.domain}}class SearchFilterGroup extends Array{constructor(view){super();this.view=view;this._selection=[];this._facet=new FacetView(this)}static fromItem(view,el){let group=new SearchFilterGroup(view);group.push(SearchFilter.fromItem(view,el,group));return group}static fromGroup(view,el){let group=new SearchFilterGroup(view);for(let child of el.children())group.push(SearchFilter.fromItem(view,$(child),group));return group}addValue(item){this._selection.push(item);this._facet.values=this._selection.map(item=>({searchString:item.getDisplayValue(),value:item.value}));this._refresh()}removeValue(item){this._selection.splice(this._selection.indexOf(item),1);this._facet.values=this._selection.map(item=>({searchString:item.getDisplayValue(),value:item.value}));this._refresh()}selectAll(){for(let item of this)this.addValue(item);this.view.update()}getFacetLabel(){return'<span class="fa fa-filter"></span>'}_refresh(){if(this._selection.length){if(this.view.facets.indexOf(this._facet)===-1)this.view.facets.push(this._facet)}else if(this.view.facets.indexOf(this._facet)>-1)this.view.facets.splice(this.view.facets.indexOf(this._facet),1);console.log(this.view.facets)}getParamValue(name,v){return v.value}clear(){this._selection=[]}}class CustomFilterItem extends SearchFilter{constructor(view,field,condition,value,group){super(view,field.name,field.caption,null,group);console.log("group",group);this.field=field;this.condition=condition;this._value=value;this._selected=true}toString(){let s=this.field.format(this._value);return this.field.caption+" "+conditionsLabels[this.condition].toLowerCase()+' "'+s+'"'}getParamValue(){console.log("search param",this.searchValue)}get value(){let r={};r[this.field.name+conditionSuffix[this.condition]]=this._value;return r}}Katrid.uiKatrid.controller("CustomFilterController",function($scope,$element,$filter){$scope.tempFilter=null;$scope.customFilter=[];$scope.fieldChange=function(field){$scope.field=field;$scope.condition=field.defaultCondition;$scope.conditionChange($scope.condition)};$scope.conditionChange=(condition=>{$scope.controlVisible=$scope.field.isControlVisible(condition)});$scope.valueChange=(value=>{$scope.searchValue=value});$scope.addCondition=((field,condition,value)=>{if(!$scope.tempFilter)$scope.tempFilter=new SearchFilterGroup($scope.$parent.search);$scope.tempFilter.push(new CustomFilterItem($scope.$parent.search,field,condition,value,$scope.tempFilter));$scope.field=null;$scope.condition=null;$scope.controlVisible=false;$scope.searchValue=undefined});$scope.applyFilter=(()=>{if($scope.searchValue)$scope.addCondition($scope.field,$scope.condition,$scope.searchValue);$scope.customFilter.push($scope.tempFilter);$scope.tempFilter.selectAll();$scope.tempFilter=null;$scope.customSearchExpanded=false})}).directive("customFilter",()=>({restrict:"A",scope:{action:"="}}));class SearchView{constructor(scope,view){this.scope=scope;this.query=new SearchQuery(this);this.viewMoreButtons=false;this.items=[];this.filterGroups=[];this.groups=[];this.facets=[];this.view=view;this.el=$(view.content);let menu=this.createMenu(scope,el.find(".search-dropdown-menu.search-view-menu"),el);console.log("menu",menu);for(let child of this.el.children()){child=$(child);let tag=child.prop("tagName");let obj;if(tag==="FILTER"){obj=SearchFilterGroup.fromItem(this,child);this.filterGroups.push(obj)}else if(tag==="FILTER-GROUP"){obj=SearchFilterGroup.fromGroup(this,child);this.filterGroups.push(obj)}this.append(obj)}}createMenu(scope,el,parent){const menu=new SearchMenu(el,parent,{select:this.onSelectItem});menu.searchView=this;return menu}append(item){this.items.push(item)}remove(index){let facet=this.facets[index];facet.destroy();this.facets.splice(index,1)}getParams(){let r=[];for(let i of this.facets)r=r.concat(i.getParamValues());return r}update(){this.scope.action.setSearchParams(this.getParams())}}class SearchViewComponent extends Katrid.UI.Widgets.Component{constructor($compile){super();this.retrict="E";this.templateUrl="view.search";this.replace=true;this.scope=false;this.$compile=$compile}link(scope,el,attrs,controller){console.log("link scope controller");let view=scope.action.views.search;let elView=$(view.content);scope.search=new SearchView(scope,view)}}Katrid.uiKatrid.controller("SearchMenuController",function($scope){});Katrid.uiKatrid.directive("searchView",SearchViewComponent);Katrid.UI.Views.SearchView=SearchView;Katrid.UI.Views.SearchViewComponent=SearchViewComponent;Katrid.UI.Views.SearchMenu=SearchMenu})();(function(){const uiKatrid=Katrid.uiKatrid;uiKatrid.filter("numberFormat",()=>{return(value,maxDigits=3)=>{if(value==null)return"";return new Intl.NumberFormat("pt-br",{maximumSignificantDigits:maxDigits}).format(value)}})})();(function(){class Comments{constructor(scope){this.scope=scope;this.model=this.scope.$parent.model;this.scope.$parent.$watch("recordId",key=>{this.items=null;this.scope.loading=Katrid.i18n.gettext("Loading...");clearTimeout(this._pendingOperation);this._pendingOperation=setTimeout(()=>{this._pendingOperation=null;this.masterChanged(key);return this.scope.$apply(()=>{return this.scope.loading=null})},1e3)});this.items=[]}async masterChanged(key){if(key){const svc=new Katrid.Services.Model("mail.message");if(this.scope.$parent.record)return svc.post("get_messages",{args:[this.scope.$parent.record.messages]}).then(res=>{this.items=res;this.scope.$apply()})}}async _sendMesage(msg,attachments){if(attachments)attachments=attachments.map(obj=>obj.id);let msgs=await this.model.post("post_message",{args:[[this.scope.$parent.recordId]],kwargs:{content:msg,content_subtype:"html",format:true,attachments:attachments}});this.scope.message="";this.items=msgs.concat(this.items);this.scope.$apply();this.scope.files=null;this.scope.hideEditor()}postMessage(msg){if(this.scope.files.length){let files=[];for(let f of this.scope.files)files.push(f.file);var me=this;Katrid.Services.Attachments.upload({files:files},this.scope).done(res=>{me._sendMesage(msg,res)})}else this._sendMesage(msg)}}Katrid.uiKatrid.directive("comments",()=>({restrict:"E",scope:{},replace:true,template:'<div class="content"><div class="comments"><mail-comments/></div></div>',link(scope,element,attrs){$(element).closest("form-view[ng-form=form]").find(".content-scroll>.content").append(element)}}));Katrid.uiKatrid.directive("mailComments",()=>({restrict:"E",controller:$scope=>{$scope.comments=new Comments($scope);$scope.files=[];$scope.showEditor=(()=>{$($scope.el).find("#mail-editor").show();$($scope.el).find("#mail-msgEditor").focus()});$scope.hideEditor=(()=>{$($scope.el).find("#mail-editor").hide()});$scope.attachFile=(file=>{for(let f of file.files)$scope.files.push({name:f.name,type:f.type,file:f});$scope.$apply()});$scope.deleteFile=(idx=>{$scope.files.splice(idx,1)})},replace:true,link(scope,element,attrs){scope.el=element},template(){return`\n  <div class="container">\n          <h3>${Katrid.i18n.gettext("Comments")}</h3>\n          <div class="form-group">\n          <button class="btn btn-outline-secondary" ng-click="showEditor();">${Katrid.i18n.gettext("New message")}</button>\n          <button class="btn btn-outline-secondary">${Katrid.i18n.gettext("Log an internal note")}</button>\n          </div>\n          <div id="mail-editor" style="display: none;">\n            <div class="form-group">\n              <textarea id="mail-msgEditor" class="form-control" ng-model="message"></textarea>\n            </div>\n            <div class="form-group">\n              <button class="btn btn-default" type="button" onclick="$(this).next().click()"><i class="fa fa-paperclip"></i></button>\n              <input class="input-file-hidden" type="file" multiple onchange="angular.element(this).scope().attachFile(this)">\n            </div>\n            <div class="form-group" ng-show="files.length">\n              <ul class="list-inline attachments-area">\n                <li ng-repeat="file in files" ng-click="deleteFile($index)" title="${Katrid.i18n.gettext("Delete this attachment")}">{{ file.name }}</li>\n              </ul>\n            </div>\n            <div class="from-group">\n              <button class="btn btn-primary" ng-click="comments.postMessage(message)">${Katrid.i18n.gettext("Send")}</button>\n            </div>\n          </div>\n  \n          <hr>\n  \n          <div ng-show="loading">{{ loading }}</div>\n          <div class="comment media col-sm-12" ng-repeat="comment in comments.items">\n            <div class="media-left">\n              <img src="/static/web/assets/img/avatar.png" class="avatar rounded">\n            </div>\n            <div class="media-body">\n              <strong>{{ ::comment.author[1] }}</strong> - <span class="timestamp text-muted" title="{{ ::comment.date_time|moment:'LLLL'}}"> {{::comment.date_time|moment}}</span>\n              <div class="clearfix"></div>\n              <div class="form-group">\n                {{::comment.content}}\n              </div>\n              <div class="form-group" ng-if="comment.attachments">\n                <ul class="list-inline">\n                  <li ng-repeat="file in comment.attachments"><a href="/web/content/{{ ::file.id }}/?download">{{ ::file.name }}</a></li>\n                </ul>\n              </div>\n            </div>\n          </div>\n    </div>`}}));class MailFollowers{}class MailComments extends Katrid.UI.Widgets.Widget{static initClass(){this.prototype.tag="mail-comments"}spanTemplate(scope,el,attrs,field){return""}}MailComments.initClass();Katrid.UI.Widgets.MailComments=MailComments}).call(this);(function(){class DashboardView extends Katrid.UI.Views.ClientView{get templateUrl(){return"view.dashboard"}}class DashboardComponent extends Katrid.UI.Widgets.Component{constructor($compile){super();this.$compile=$compile;this.restrict="E";this.scope=false}async link(scope,el,attrs,controller){let dashboardId=attrs.dashboardId;let model=new Katrid.Services.Model("ir.dashboard.settings");let res=await model.search({dashboard_id:dashboardId});if(res.data){let content=res.data[0].content;content=this.$compile(content)(scope);el.append(content)}}}class Chart extends Katrid.UI.Widgets.Component{constructor(){super();this.replace=true;this.template="<div></div>"}async link(scope,el,attrs){let res,chart;let observe=async()=>{if(_.isUndefined(attrs.url))res=await Katrid.Services.Query.read(attrs.queryId);else res=await $.ajax({url:attrs.url,type:"get"});if(chart)chart.destroy();chart=c3.generate({bindto:el[0],data:{type:"donut",columns:res.data}})};attrs.$observe("url",observe)}}class Query extends Katrid.UI.Widgets.Component{constructor(){super();this.scope=false}link(scope,el,attrs){if(!attrs.name)throw Error("Query name attribute is required!");let r;if(_.isUndefined(attrs.url))r=Katrid.Services.Query.read(attrs.id);else r=$.get(attrs.url);r.done(res=>{let data=res.data.map(row=>_.object(res.fields,row));scope.$apply(()=>scope[attrs.name]=data)});el.remove()}}Katrid.Actions.ClientAction.register("dashboard",DashboardView);Katrid.uiKatrid.directive("dashboard",DashboardComponent);Katrid.uiKatrid.directive("chart",Chart);Katrid.uiKatrid.directive("query",Query)})();(function(){class Import extends Katrid.UI.Views.View{constructor(scope){super(scope);this.templateUrl="view.import"}}Katrid.Actions.ClientAction.register("import",Import)}).call(this);(function(){class Recognition{constructor(){this.active=false}init(){let rec=window.SpeechRecognition||window.webkitSpeechRecognition||window.mozSpeechRecognition||window.msSpeechRecognition||window.oSpeechRecognition;rec=this.recognition=new rec;rec.continuous=true;rec.onresult=this.onResult;rec.onstart=(()=>this.active=true);rec.onend=(()=>this.active=false)}pause(){return this.recognition.pause()}resume(){return this.recognition.resume()}start(){if(this.recognition==null){this.init()}return this.recognition.start()}stop(){return this.recognition.stop()}toggle(){if(this.active){return this.stop()}else{return this.start()}}onResult(event){return console.log(event)}}class VoiceCommand extends Recognition{constructor(){super();this.onResult=this.onResult.bind(this);this.commands=[]}onResult(event){const res=event.results[event.results.length-1];let cmd=res[0].transcript;if(cmd){cmd=cmd.trim();for(let obj of this.commands){if(obj.name.toLocaleLowerCase()===cmd.toLocaleLowerCase()){if(obj.command)eval(obj.command);else if(obj.href)window.location.href=obj.href;break}}}}addCommands(cmds){return this.commands=this.commands.concat(cmds)}}Katrid.Speech={Recognition:Recognition,VoiceCommand:VoiceCommand};Katrid.Speech.voiceCommand=new VoiceCommand;if(Katrid.Settings.Speech.enabled){let model=new Katrid.Services.Model("voice.command");model.search().done(res=>{if(res.ok)for(let cmd of res.result.data)Katrid.Speech.voiceCommand.commands.push({name:cmd.name,command:cmd.command})});Katrid.Speech.voiceCommand.start()}}).call(this);
//# sourceMappingURL=katrid.full.min.js.map
(function() {

  class Alerts {
    success(msg) {
      return toastr['success'](msg);
    }
  }

  Katrid.Dialogs.Alerts = Alerts;

})();

(function () {

  let uiKatrid = Katrid.uiKatrid;

  let formCount = 0;

  uiKatrid.directive('field', function ($compile) {
    return {
      restrict: 'E',
      replace: true,
      priority: -1,
      link(scope, element, attrs, ctrl) {
        let inplaceEditor = $(element).closest('.table.dataTable').length > 0;
        let field = scope.view.fields[attrs.name];
        if (field && field.visible === false) {
          element.remove();
          return;
        }
        // Overrides the field label
        if (attrs.label) field.caption = attrs.label;

        if (!element.parent('list').length) {
          let v;
          element.removeAttr('name');

          if (_.isUndefined(field))
            throw Error('Field not found: ' + attrs.name);

          let widget = field.createWidget(attrs.widget, scope, attrs, element);
          widget.inplaceEditor = inplaceEditor;

          let templ = widget.renderTo('section', inplaceEditor);
          templ = $compile(templ)(scope);
          element.replaceWith(templ);
          if (!inplaceEditor && widget.col) templ.addClass(`col-md-${widget.col}`);

          // Add input field for tracking on FormController
          let fcontrol = templ.find('.form-field');
          if (fcontrol.length) {
            fcontrol = fcontrol[fcontrol.length - 1];
            const form = templ.controller('form');
            ctrl = angular.element(fcontrol).data().$ngModelController;
            if (ctrl) form.$addControl(ctrl);
          }

          //templ.find('.field').addClass("col-md-#{attrs.cols or cols or 6}")
          // Remove field attrs from section element
          let fieldAttrs = {};

          widget.link(scope, templ, fieldAttrs, $compile, field);

          for (let [k, v] of Object.entries(attrs))
            if (k.startsWith('field')) {
              fieldAttrs[k] = v;
              element.removeAttr(k);
              attrs.$set(k);
            }

          fieldAttrs.name = attrs.name;
        }
      }
    };
  });

  uiKatrid.directive('inputField', () => ({
    restrict: 'A',
    scope: false,
    link(scope, element, attrs) {
      $(element).on('click', function() {
        // input field select all text on click
        $(this).select();
      });
    }
  }));


  uiKatrid.directive('view', () =>
    ({
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
    })
  );

  // uiKatrid.directive('list', ($compile, $http) =>
  //   ({
  //     restrict: 'E',
  //     priority: 700,
  //     link(scope, element, attrs) {
  // console.log('render list');
  //       let html = Katrid.UI.Utils.Templates.renderList(scope, element, attrs);
  //       html = $compile(html)(scope);
  //       return element.replaceWith(html);
  //     }
  //   })
  // );

  class Total {
    constructor($filter) {
      this.restrict = 'E';
      this.scope = false;
      this.replace = true;
      this.$filter = $filter;
    }

    template(el, attrs) {
      if (attrs.type[0] === "'")
        return `<span>${ attrs.type.substring(1, attrs.type.length - 1) }</span>`;
      else
        return `<span ng-bind="total$${attrs.field}|number:2"></span>`;
    }

    link(scope, element, attrs, controller) {
      if (attrs.type[0] !== "'")
        scope.$watch(`records`, (newValue) => {
          let total = 0;
          newValue.map((r) => total += parseFloat(r[attrs.field]));
          console.log('RECORDS CHANGED', total);
          scope['total$' + attrs.field] = total;
        });
    }
  }

  uiKatrid.directive('ngTotal', Total);

  uiKatrid.directive('ngSum', () =>
    ({
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
    })
  );


  uiKatrid.directive('ngEnter', () =>
    (scope, element, attrs) =>
      element.bind("keydown keypress", (event) => {
        if (event.which === 13) {
          scope.$apply(() => scope.$eval(attrs.ngEnter, {$event: event}));
          event.preventDefault();
        }
      })
  );

  uiKatrid.directive('ngEsc', () =>
    (scope, element, attrs) =>
      element.bind("keydown keypress", (event) => {
        if (event.which === 27) {
          scope.$apply(() => scope.$eval(attrs.ngEsc, {$event: event}));
          event.preventDefault();
        }
      })
  );

  uiKatrid.directive('datetimepicker', ['$filter', $filter => ({
    restrict: 'A',
    require: '?ngModel',
    link(scope, el, attrs, controller) {
      let calendar = $(el).datetimepicker({
      });
      const dateFmt = Katrid.i18n.gettext('yyyy-MM-dd hh:mma');
      // Mask date format
      if (Katrid.Settings.UI.dateInputMask === true) {
        console.log('set input mask');
        el = el.mask(dateFmt.replace(/[A-z]/g, 0));
      } else if (Katrid.Settings.UI.dateInputMask) {
        el = el.mask(Katrid.Settings.UI.dateInputMask);
      }

      el.on('click', () => setTimeout(() => $(el).select()));
      controller.$formatters.push(function (value) {
        if (value) {
          const dt = new Date(value);
          // calendar.datepicker('setDate', dt);
          return $filter('date')(value, dateFmt);
        }
        return value;
      });

      controller.$render = function () {
        if (_.isDate(controller.$viewValue)) {
          const v = $filter('date')(controller.$viewValue, dateFmt);
          return el.val(v);
        } else {
          return el.val(controller.$viewValue);
        }
      };

    }
  })]);


  uiKatrid.directive('datepicker', ['$filter', $filter =>
    ({
      restrict: 'A',
      priority: 1,
      require: '?ngModel',
      link(scope, element, attrs, controller) {
        let el = element;
        const dateFmt = Katrid.i18n.gettext('yyyy-mm-dd');
        const shortDate = dateFmt.replace(/[m]/g, 'M');
        var calendar = element.parent('div').datePicker({
          format: dateFmt,
          keyboardNavigation: false,
          language: Katrid.i18n.languageCode,
          forceParse: false,
          autoClose: true,
          showOnFocus: false
        }).on('changeDate', function (e) {
          const dp = calendar.data('datepicker');
          if (dp.picker && dp.picker.is(':visible')) {
            el.val($filter('date')(dp._utc_to_local(dp.viewDate), shortDate));
            return dp.hide();
          }
        });

        el.on('click', () => setTimeout(() => $(el).select()));

        // Mask date format
        if (Katrid.Settings.UI.dateInputMask === true) {
          el = el.mask(dateFmt.replace(/[A-z]/g, 0));
        } else if (Katrid.Settings.UI.dateInputMask) {
          el = el.mask(Katrid.Settings.UI.dateInputMask);
        }

        controller.$formatters.push(function (value) {
          if (value) {
            const dt = new Date(value);
            calendar.datepicker('setDate', dt);
            return $filter('date')(value, shortDate);
          }
        });

        controller.$parsers.push(function (value) {
          if (_.isDate(value)) {
            return moment.utc(value).format('YYYY-MM-DD');
          }
          if (_.isString(value)) {
            return moment.utc(value, shortDate.toUpperCase()).format('YYYY-MM-DD');
          }
        });

        controller.$render = function () {
          if (_.isDate(controller.$viewValue)) {
            const v = $filter('date')(controller.$viewValue, shortDate);
            return el.val(v);
          } else {
            return el.val(controller.$viewValue);
          }
        };

        return el.on('blur', function (evt) {
          let sep, val;
          const dp = calendar.data('datepicker');
          if (dp.picker.is(':visible')) {
            dp.hide();
          }
          if (Array.from(Katrid.i18n.formats.SHORT_DATE_FORMAT).includes('/')) {
            sep = '/';
          } else {
            sep = '-';
          }
          const fmt = Katrid.i18n.formats.SHORT_DATE_FORMAT.toLowerCase().split(sep);
          const dt = new Date();
          let s = el.val();
          if ((fmt[0] === 'd') && (fmt[1] === 'm')) {
            if ((s.length === 5) || (s.length === 6)) {
              if (s.length === 6) {
                s = s.substr(0, 5);
              }
              val = s + sep + dt.getFullYear().toString();
            }
            if ((s.length === 2) || (s.length === 3)) {
              if (s.length === 3) {
                s = s.substr(0, 2);
              }
              val = new Date(dt.getFullYear(), dt.getMonth(), s);
            }
          } else if ((fmt[0] === 'm') && (fmt[1] === 'd')) {
            if ((s.length === 5) || (s.length === 6)) {
              if (s.length === 6) {
                s = s.substr(0, 5);
              }
              val = s + sep + dt.getFullYear().toString();
            }
            if ((s.length === 2) || (s.length === 3)) {
              if (s.length === 3) {
                s = s.substr(0, 2);
              }
              val = new Date(dt.getFullYear(), s, dt.getDay());
            }
          }
          if (val) {
            calendar.datepicker('setDate', val);
            el.val($filter('date')(dp._utc_to_local(dp.viewDate), shortDate));
            return controller.$setViewValue($filter('date')(dp._utc_to_local(dp.viewDate), shortDate));
          }
        });
      }
    })

  ]);

  uiKatrid.directive('ajaxChoices', $location =>
    ({
      restrict: 'A',
      require: '?ngModel',
      link(scope, element, attrs, controller) {
        const {multiple} = attrs;
        const serviceName = attrs.ajaxChoices;
        const cfg = {
          ajax: {
            type: 'POST',
            url: serviceName,
            dataType: 'json',
            quietMillis: 500,
            params: { contentType: "application/json; charset=utf-8" },
            data(term, page) {
              return JSON.stringify({
                q: term,
                count: 1,
                page: page - 1,
                //file: attrs.reportFile
                field: attrs.field,
                model: attrs.modelChoices
              });
            },
            results(res, page) {
              let data = res.items;
              const more = (page * Katrid.Settings.Services.choicesPageLimit) < res.count;
              return {
                results: (Array.from(data).map((item) => ({id: item[0], text: item[1]}))),
                more
              };
            }
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
                  values.push({id: i[0], text: i[1]});
                }
                return callback(values);
              } else {
                return callback({id: v[0], text: v[1]});
              }
            }
          }
        };
        if (multiple)
          cfg['multiple'] = true;

        const el = element.select2(cfg);
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
    })
  );

  uiKatrid.directive('uiMask', () =>
    ({
      restrict: 'A',
      link(scope, element, attrs) {
        element.mask(attrs.uiMask);
      }
    })
  );


  class Decimal {
    constructor($filter) {
      this.restrict = 'A';
      this.require = 'ngModel';
      this.$filter = $filter;
    }

    link(scope, element, attrs, controller) {
      let precision = 2;
      if (attrs.decimalPlaces)
       precision = parseInt(attrs.decimalPlaces);

      const thousands = attrs.uiMoneyThousands || ".";
      const decimal = attrs.uiMoneyDecimal || ",";
      const symbol = attrs.uiMoneySymbol;
      const negative = attrs.uiMoneyNegative || true;

      const el = element.maskMoney({
        symbol,
        thousands,
        decimal,
        precision,
        allowNegative: negative,
        allowZero: true
      })
      .bind('keyup blur', function (event) {
      });

      controller.$render = () => {
        if (controller.$viewValue) {
          return element.val(this.$filter('number')(controller.$viewValue, precision));
        } else {
          return element.val('');
        }
      };

      controller.$parsers.push(value => {
        if (_.isString(value) && value) {
          if (precision)
             value = element.maskMoney('unmasked')[0];
          else {
            value = value.replace(new RegExp(`\\${thousands}`, 'g'), '');
            value = parseInt(value);
          }
        } else if (value)
          return value;
        else
          value = null;
        return value;
        // if (el.val()) {
        //   if (precision) {
        //     let newVal = element.maskMoney('unmasked')[0];
        //     if (_.isString(newVal))
        //       newVal = parseFloat(newVal.replace(new RegExp('\\' + decimal, 'g'), '.'));
        //     console.log('decimal new val', newVal);
        //     if (newVal !== parseFloat(controller.$viewValue)) {
        //       controller.$setViewValue(parseFloat(newVal));
        //       scope.$apply();
        //     }
        //   } else {
        //     let s = `\\${thousands}`;
        //     let newVal = el.val().replace(new RegExp(s, 'g'), '');
        //     newVal = parseInt(newVal);
        //
        //     if (newVal !== parseInt(controller.$viewValue)) {
        //       controller.$setViewValue(newVal);
        //       scope.$apply();
        //     }
        //   }
        // } else if (controller.$viewValue)
        //   controller.$setViewValue('');
      })
    }

  }


  uiKatrid.directive('decimal', Decimal);


  Katrid.uiKatrid.directive('foreignkey', ($compile, $controller) =>
    ({
      restrict: 'A',
      require: 'ngModel',
      link(scope, el, attrs, controller) {
        //f = scope.view.fields['model']
        let domain, serviceName;
        let sel = el;
        let _shown = false;
        const field = scope.view.fields[attrs.name];

        if (attrs.domain != null)
          domain = attrs.domain;
        else if (field.domain)
          domain = field.domain;

        if (_.isString(domain))
          domain = $.parseJSON(domain);

        el.addClass('form-field');

        if (attrs.serviceName)
          serviceName = attrs;
        else
          serviceName = scope.action.model.name;

        const newItem = function () {};
        const newEditItem = function () {};
        let _timeout = null;

        let config = {
          allowClear: true,

          query(query) {

            let data = {
              args: [query.term],
              kwargs: {
                count: 1,
                page: query.page,
                domain,
                name_fields: (attrs.nameFields && attrs.nameFields.split(',')) || null
              }
            };

            const f = () => {
              let svc;
              if (scope.model)
                svc = scope.model.getFieldChoices(field.name, query.term);
              else
                svc = (new Katrid.Services.Model(field.model)).searchName(data);
              svc.then(res => {

                let data = res.items;
                const r = data.map(item => ({ id: item[0], text: item[1] }));
                const more = (query.page * Katrid.Settings.Services.choicesPageLimit) < res.count;
                if (!multiple && !more) {
                  let msg;
                  const v = sel.data('select2').search.val();
                  if (((attrs.allowCreate && (attrs.allowCreate !== 'false')) || (attrs.allowCreate == null)) && v) {
                    msg = Katrid.i18n.gettext('Create <i>"%s"</i>...');
                    r.push({
                      id: newItem,
                      text: msg
                    });
                  }
                  if (((attrs.allowCreateEdit && (attrs.allowCreateEdit !== 'false')) || !attrs.allowCreateEdit) && v) {
                    msg = Katrid.i18n.gettext('Create and Edit...');
                    r.push({
                      id: newEditItem,
                      text: msg
                    });
                  }
                }
                return query.callback({ results: r, more });

              });
              return;

              $.ajax({
                url: config.ajax.url,
                type: config.ajax.type,
                dataType: config.ajax.dataType,
                contentType: config.ajax.contentType,
                data: JSON.stringify(data),
                success(data) {
                  const res = data.result;
                  data = res.items;
                  const r = data.map(item => ({id: item[0], text: item[1]}));
                  const more = (query.page * Katrid.Settings.Services.choicesPageLimit) < res.count;
                  if (!multiple && !more) {
                    let msg;
                    const v = sel.data('select2').search.val();
                    if (((attrs.allowCreate && (attrs.allowCreate !== 'false')) || (attrs.allowCreate == null)) && v) {
                      msg = Katrid.i18n.gettext('Create <i>"%s"</i>...');
                      r.push({
                        id: newItem,
                        text: msg
                      });
                    }
                    if (((attrs.allowCreateEdit && (attrs.allowCreateEdit !== 'false')) || !attrs.allowCreateEdit) && v) {
                      msg = Katrid.i18n.gettext('Create and Edit...');
                      r.push({
                        id: newEditItem,
                        text: msg
                      });
                    }
                  }
                  return query.callback({results: r, more});
                }
              });
            };
            if (_timeout)
              clearTimeout(_timeout);

            _timeout = setTimeout(f, 400);
          },

          ajax: {
            url: `/api/rpc/${serviceName}/get_field_choices/`,
            contentType: 'application/json',
            dataType: 'json',
            type: 'POST'
          },

          formatSelection(val) {
            if ((val.id === newItem) || (val.id === newEditItem))
              return Katrid.i18n.gettext('Creating...');
            return val.text;
          },

          formatResult(state) {
            const s = sel.data('select2').search.val();
            if (state.id === newItem) {
              state.str = s;
              return `<strong>${sprintf(state.text, s)}</strong>`;
            } else if (state.id === newEditItem) {
              state.str = s;
              return `<strong>${sprintf(state.text, s)}</strong>`;
            }
            return state.text;
          },

          initSelection(el, cb) {
            let v = controller.$modelValue;
            if (multiple) {
              v = v.map(obj => ({id: obj[0], text: obj[1]}));
              return cb(v);
            } else if (_.isArray(v)) {
              return cb({id: v[0], text: v[1]});
            }
          }
        };

        let {multiple} = attrs;

        if (multiple) {
          config['multiple'] = true;
        }

        sel = sel.select2(config);

        sel.on('change', (e) => {
          let v = e.added;
          if (v && (v.id === newItem)) {
            let service = new Katrid.Services.Model(field.model);
            return service.createName(v.str)
            .done((res) => {
              // check if dialog is needed
              if (res.ok) {
                controller.$setDirty();
                controller.$setViewValue({id: res.result[0], text: res.result[1]});
                //sel.select2('val', {id: res.result[0], text: res.result[1]});
              }
            })
            .fail(res => {
              // if error creating record
              // show the creation dialog
              service.getViewInfo({view_type: 'form'})
              .done(res => {
                console.log('view info', res);
              });
            });
          } else if (v && (v.id === newEditItem)) {
            let service = new Katrid.Services.Model(field.model);
            return service.getViewInfo({ view_type: 'form' })
            .done(function (res) {
              let wnd = new Katrid.Dialogs.Window(scope, { view: res.result }, $compile);
              //let el = Katrid.Dialogs.showWindow(scope, field, res.result, $compile, $controller);
              wnd.show();/*.modal('show').on('hide.bs.modal', () => {
                let elScope = wnd.scope;
                if (elScope.result) {
                  return $.get(`/api/rpc/${serviceName}/get_field_choices/`, {
                    args: attrs.name,
                    ids: elScope.result[0]
                  })
                  .done(function (res) {
                    if (res.ok) {
                      controller.$setDirty();
                      controller.$setViewValue({id: res.result[0], text: res.result[1]});
                      // console.log('set value', res.result);
                      // sel.select2('val', {id: res.result[0], text: res.result[1]});
                    }
                  });
                }
              })*/
            });

          } else if (multiple && e.val.length) {
            return controller.$setViewValue(e.val);
          } else {
            controller.$setDirty();
            if (v) {
              return controller.$setViewValue([v.id, v.text]);
            } else {
              return controller.$setViewValue(null);
            }
          }
        })
        .on('select2-open', () => {
          if (!_shown) {
            // remove select2 on modal hide event
            _shown = true;
            let parentModal = el.closest('div.modal');
            if (parentModal.length)
              parentModal.on('hide.bs.modal', () => sel.select2('destroy'));
          }
        });

        controller.$parsers.push((value) => {
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

        if (!multiple) scope.$watch(attrs.ngModel, (newValue, oldValue) => sel.select2('val', newValue));

        return controller.$render = function () {
          if (multiple) {
            if (controller.$viewValue) {
              const v = (Array.from(controller.$viewValue).map((obj) => obj[0]));
              sel.select2('val', v);
            }
          }
          if (controller.$viewValue) {
            return sel.select2('val', controller.$viewValue[0]);
          } else {
            return sel.select2('val', null);
          }
        };
      }
    })
  );


  // uiKatrid.directive('searchView', $compile =>
  //   ({
  //     restrict: 'E',
  //     scope: false,
  //     //require: 'ngModel'
  //     templateUrl: 'view.search',
  //     replace: true,
  //     link(scope, el, attrs, controller) {
  //       console.log(scope);
  //       scope.search = {};
  //       const widget = new Katrid.UI.Views.SearchView(scope, {});
  //       widget.link(scope, el, attrs, controller, $compile);
  //     }
  //   })
  // );


  // uiKatrid.directive('searchBox', () =>
  //   ({
  //     restrict: 'A',
  //     require: 'ngModel',
  //     link(scope, el, attrs, controller) {
  //       const view = scope.views.search;
  //       const {fields} = view;
  //
  //       const cfg = {
  //         multiple: true,
  //         minimumInputLength: 1,
  //         formatSelection: (obj, element) => {
  //           if (obj.field) {
  //             element.append(`<span class="search-icon">${obj.field.caption}</span>: <i class="search-term">${obj.text}</i>`);
  //           } else if (obj.id.caption) {
  //             element.append(`<span class="search-icon">${obj.id.caption}</span>: <i class="search-term">${obj.text}</i>`);
  //           } else {
  //             element.append(`<span class="fa fa-filter search-icon"></span><span class="search-term">${obj.text}</span>`);
  //           }
  //         },
  //
  //         id(obj) {
  //           if (obj.field) {
  //             return obj.field.name;
  //             return `<${obj.field.name} ${obj.id}>`;
  //           }
  //           return obj.id.name;
  //           return obj.id.name + '-' + obj.text;
  //         },
  //
  //         formatResult: (obj, element, query) => {
  //           if (obj.id.type === 'ForeignKey') {
  //             return `> Pesquisar <i>${obj.id.caption}</i> por: <strong>${obj.text}</strong>`;
  //           } else if (obj.field && (obj.field.type === 'ForeignKey')) {
  //             return `${obj.field.caption}: <i>${obj.text}</i>`;
  //           } else {
  //             return `Pesquisar <i>${obj.id.caption}</i> por: <strong>${obj.text}</strong>`;
  //           }
  //         },
  //
  //         query: options => {
  //           if (options.field) {
  //             scope.model.getFieldChoices(options.field.name, options.term)
  //             .done(res =>
  //               options.callback({
  //                 results: (Array.from(res.result).map((obj) => ({id: obj[0], text: obj[1], field: options.field})))
  //               })
  //             );
  //             return;
  //           }
  //
  //           options.callback({
  //             results: ((() => {
  //               const result = [];
  //               for (let f in fields) {
  //                 result.push({id: fields[f], text: options.term});
  //               }
  //               return result;
  //             })())
  //           });
  //         }
  //       };
  //
  //       el.select2(cfg);
  //       el.data('select2').blur();
  //       el.on('change', () => {
  //         return controller.$setViewValue(el.select2('data'));
  //       });
  //
  //       el.on('select2-selecting', e => {
  //         if (e.choice.id.type === 'ForeignKey') {
  //           const v = el.data('select2');
  //           v.opts.query({
  //             element: v.opts.element,
  //             term: v.search.val(),
  //             field: e.choice.id,
  //             callback(data) {
  //               v.opts.populateResults.call(v, v.results, data.results, {term: '', page: null, context: v.context});
  //               return v.postprocessResults(data, false, false);
  //             }
  //           });
  //
  //           return e.preventDefault();
  //         }
  //       });
  //
  //     }
  //   })
  // );


  uiKatrid.filter('m2m', () =>
    function (input) {
      if (_.isArray(input))
        return input.map((obj) => obj ? obj[1] : null).join(', ');
    }
  );


  uiKatrid.filter('moment', () =>
    function (input, format) {
      if (format) {
        return moment().format(format);
      }
      return moment(input).fromNow();
    }
  );


  uiKatrid.directive('fileReader', () =>
    ({
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
    })
  );


  uiKatrid.directive('dateInput', ['$filter', ($filter) => ({
    restrict: 'A',
    require: '?ngModel',
    link(scope, element, attrs, controller) {

      let setNow = () => {
        let value;
        if (attrs['type'] === 'date')
           value = (new Date()).toISOString().split('T')[0];
        else
          value = moment(new Date()).format('YYYY-MM-DD HH:mm').replace(' ', 'T');  // remove timezone info
        $(element).val(value);
        controller.$setViewValue(value);
        _focus = false;
      };

      let _focus = true;

      element
      .focus(function() {
        if (($(this).val() === ''))
          _focus = true;
      })
      .keypress(function(evt) {
        if (evt.key.toLowerCase() === 'h') {
          setNow();
          evt.stopPropagation();
          evt.preventDefault();
        }
      })
      .keydown(function(evt) {
        if (/\d/.test(evt.key)) {
          if (($(this).val() === '') && (_focus))
            setNow();
        }
      });

      controller.$formatters.push(function(value) {
        if (value) {
          if (attrs['type'] === 'date')
            return new Date(moment.utc(value).format('YYYY-MM-DD') + 'T00:00');
          else
            return new Date(value);
        }
      });

      controller.$parsers.push(function (value) {
        if (_.isDate(value)) {
          if (attrs['type'] === 'date')
            return moment.utc(value).format('YYYY-MM-DD');
          else
            return moment.utc(value).format('YYYY-MM-DDTHH:mm:ss');
        }
      });

    }
  })]);


  uiKatrid.directive('statusField', ['$compile', '$timeout', ($compile, $timeout) =>
    ({
      restrict: 'E',
      require: 'ngModel',
      replace: true,
      scope: {},
      link(scope, element, attrs, controller) {
        const field = scope.$parent.view.fields[attrs.name];
        scope.choices = field.choices;
        if (!attrs.readonly) {
          scope.itemClick = () => console.log('status field item click');
        }
      },
      template(element, attrs) {
        return sprintf(Katrid.$templateCache.get('view.field.StatusField'), { fieldName: attrs.name });
      }
    })

  ]);

  uiKatrid.directive('cardDraggable', () => {
    return {
      restrict: 'A',
      link(scope, element, attrs, controller) {
        let cfg = {
          connectWith: attrs.cardDraggable,
          items: '> .sortable-item'
        };
        // Draggable write expression
        if (!_.isUndefined(attrs.cardItem))
          cfg['receive'] = (event, ui) => {
            let parent = angular.element(ui.item.parent()).scope();
            let scope = angular.element(ui.item).scope();
            console.log(scope);
            console.log(parent);
            let data = {};
            data['id'] = scope.record.id;
            $.extend(data, parent.group._domain);
            parent.model.write([data])
            .then(res => {
              console.log('write ok', res);
            });
          };
        // Group reorder
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
        element.sortable(cfg).disableSelection();
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
    // check if element object has select2 data
    if (e.data('select2')) e.select2('focus');
    else el.focus();
  };

  uiKatrid.directive('attachmentsButton', () => ({
    restrict: 'A',
    scope: false,
    link: (scope, el) => {
      let _pendingOperation;
      scope.$parent.$watch('recordId', (key) => {
        let attachment = new Katrid.Services.Model('ir.attachment', scope);
        scope.$parent.attachments = [];
        clearTimeout(_pendingOperation);
        _pendingOperation = setTimeout(() => {
          attachment.search({ params: { model: scope.action.model.name, object_id: key }, count: false })
          .then(res => {
            let r = null;
            if (res && res.data)
              r = res.data;
            scope.$apply(() => scope.attachments = r );
          });
        }, 1000);

      });
    }
  }));

  uiKatrid.directive('action', ($compile) => ({
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
        if (attrs.object) scope.model.rpc(attrs.object, [scope.$parent.record.id]);
        //scope.$eval(attrs.ngClick);
      });
      actions.append(newItem);
      el.remove();
    }
  }));

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
              })
            }
          });
        }
        $scope.kanbanHideAddGroupItemDlg(event);
      };

    }
  }

})();

/*
 *  jquery-maskmoney - v3.0.2
 *  jQuery plugin to mask data entry in the input text in the form of money (currency)
 *  https://github.com/plentz/jquery-maskmoney
 *
 *  Made by Diego Plentz
 *  Under MIT License (https://raw.github.com/plentz/jquery-maskmoney/master/LICENSE)
 */
(function ($) {
  "use strict";
  if (!$.browser) {
    $.browser = {};
    $.browser.mozilla = /mozilla/.test(navigator.userAgent.toLowerCase()) && !/webkit/.test(navigator.userAgent.toLowerCase());
    $.browser.webkit = /webkit/.test(navigator.userAgent.toLowerCase());
    $.browser.opera = /opera/.test(navigator.userAgent.toLowerCase());
    $.browser.msie = /msie/.test(navigator.userAgent.toLowerCase());
  }

  var methods = {
    destroy: function () {
      $(this).unbind(".maskMoney");

      if ($.browser.msie) {
        this.onpaste = null;
      }
      return this;
    },

    mask: function (value) {
      return this.each(function () {
        var $this = $(this),
          decimalSize;
        if (typeof value === "number") {
          $this.trigger("mask");
          decimalSize = $($this.val().split(/\D/)).last()[0].length;
          value = value.toFixed(decimalSize);
          $this.val(value);
        }
        return $this.trigger("mask");
      });
    },

    unmasked: function () {
      return this.map(function () {
        var value = ($(this).val() || "0"),
          isNegative = value.indexOf("-") !== -1,
          decimalPart;
        // get the last position of the array that is a number(coercion makes "" to be evaluated as false)
        $(value.split(/\D/).reverse()).each(function (index, element) {
          if (element) {
            decimalPart = element;
            return false;
          }
        });
        value = value.replace(/\D/g, "");
        value = value.replace(new RegExp(decimalPart + "$"), "." + decimalPart);
        if (isNegative) {
          value = "-" + value;
        }
        return parseFloat(value);
      });
    },

    init: function (settings) {
      settings = $.extend({
        prefix: "",
        suffix: "",
        affixesStay: true,
        thousands: ",",
        decimal: ".",
        precision: 2,
        allowZero: false,
        allowNegative: false
      }, settings);

      return this.each(function () {
        var $input = $(this),
          onFocusValue;

        // data-* api
        settings = $.extend(settings, $input.data());

        function getInputSelection() {
          var el = $input.get(0),
            start = 0,
            end = 0,
            normalizedValue,
            range,
            textInputRange,
            len,
            endRange;

          if (typeof el.selectionStart === "number" && typeof el.selectionEnd === "number") {
            start = el.selectionStart;
            end = el.selectionEnd;
          } else {
            range = document.selection.createRange();

            if (range && range.parentElement() === el) {
              len = el.value.length;
              normalizedValue = el.value.replace(/\r\n/g, "\n");

              // Create a working TextRange that lives only in the input
              textInputRange = el.createTextRange();
              textInputRange.moveToBookmark(range.getBookmark());

              // Check if the start and end of the selection are at the very end
              // of the input, since moveStart/moveEnd doesn't return what we want
              // in those cases
              endRange = el.createTextRange();
              endRange.collapse(false);

              if (textInputRange.compareEndPoints("StartToEnd", endRange) > -1) {
                start = end = len;
              } else {
                start = -textInputRange.moveStart("character", -len);
                start += normalizedValue.slice(0, start).split("\n").length - 1;

                if (textInputRange.compareEndPoints("EndToEnd", endRange) > -1) {
                  end = len;
                } else {
                  end = -textInputRange.moveEnd("character", -len);
                  end += normalizedValue.slice(0, end).split("\n").length - 1;
                }
              }
            }
          }

          return {
            start: start,
            end: end
          };
        } // getInputSelection

        function canInputMoreNumbers() {
          var haventReachedMaxLength = !($input.val().length >= $input.attr("maxlength") && $input.attr("maxlength") >= 0),
            selection = getInputSelection(),
            start = selection.start,
            end = selection.end,
            haveNumberSelected = (selection.start !== selection.end && $input.val().substring(start, end).match(/\d/)) ? true : false,
            startWithZero = ($input.val().substring(0, 1) === "0");
          return haventReachedMaxLength || haveNumberSelected || startWithZero;
        }

        function setCursorPosition(pos) {
          $input.each(function (index, elem) {
            if (elem.setSelectionRange) {
              elem.focus();
              elem.setSelectionRange(pos, pos);
            } else if (elem.createTextRange) {
              var range = elem.createTextRange();
              range.collapse(true);
              range.moveEnd("character", pos);
              range.moveStart("character", pos);
              range.select();
            }
          });
        }

        function setSymbol(value) {
          var operator = "";
          if (value.indexOf("-") > -1) {
            value = value.replace("-", "");
            operator = "-";
          }
          return operator + settings.prefix + value + settings.suffix;
        }

        function maskValue(value) {
          var negative = (value.indexOf("-") > -1 && settings.allowNegative) ? "-" : "",
            onlyNumbers = value.replace(/[^0-9]/g, ""),
            integerPart = onlyNumbers.slice(0, onlyNumbers.length - settings.precision),
            newValue,
            decimalPart,
            leadingZeros;

          // remove initial zeros
          integerPart = integerPart.replace(/^0*/g, "");
          // put settings.thousands every 3 chars
          integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, settings.thousands);
          if (integerPart === "") {
            integerPart = "0";
          }
          newValue = negative + integerPart;

          if (settings.precision > 0) {
            decimalPart = onlyNumbers.slice(onlyNumbers.length - settings.precision);
            leadingZeros = new Array((settings.precision + 1) - decimalPart.length).join(0);
            newValue += settings.decimal + leadingZeros + decimalPart;
          }
          return setSymbol(newValue);
        }

        function maskAndPosition(startPos) {
          var originalLen = $input.val().length,
            newLen;
          $input.val(maskValue($input.val()));
          newLen = $input.val().length;
          startPos = startPos - (originalLen - newLen);
          setCursorPosition(startPos);
        }

        function mask() {
          var value = $input.val();
          if (value)
            $input.val(maskValue(value));
        }

        function changeSign() {
          var inputValue = $input.val();
          if (settings.allowNegative) {
            if (inputValue !== "" && inputValue.charAt(0) === "-") {
              return inputValue.replace("-", "");
            } else {
              return "-" + inputValue;
            }
          } else {
            return inputValue;
          }
        }

        function preventDefault(e) {
          if (e.preventDefault) { //standard browsers
            e.preventDefault();
          } else { // old internet explorer
            e.returnValue = false;
          }
        }

        function keypressEvent(e) {
          e = e || window.event;
          var key = e.which || e.charCode || e.keyCode,
            keyPressedChar,
            selection,
            startPos,
            endPos,
            value;
          //added to handle an IE "special" event
          if (key === undefined) {
            return false;
          }

          // any key except the numbers 0-9
          if (key < 48 || key > 57) {
            // -(minus) key
            if (key === 45) {
              $input.val(changeSign());
              return false;
              // +(plus) key
            } else if (key === 43) {
              $input.val($input.val().replace("-", ""));
              return false;
              // enter key or tab key
            } else if (key === 13 || key === 9) {
              return true;
            } else if ($.browser.mozilla && (key === 37 || key === 39) && e.charCode === 0) {
              // needed for left arrow key or right arrow key with firefox
              // the charCode part is to avoid allowing "%"(e.charCode 0, e.keyCode 37)
              return true;
            } else { // any other key with keycode less than 48 and greater than 57
              preventDefault(e);
              return true;
            }
          } else if (!canInputMoreNumbers()) {
            return false;
          } else {
            preventDefault(e);

            keyPressedChar = String.fromCharCode(key);
            selection = getInputSelection();
            startPos = selection.start;
            endPos = selection.end;
            value = $input.val();
            $input.val(value.substring(0, startPos) + keyPressedChar + value.substring(endPos, value.length));
            maskAndPosition(startPos + 1);
            return false;
          }
        }

        function keydownEvent(e) {
          e = e || window.event;
          var key = e.which || e.charCode || e.keyCode,
            selection,
            startPos,
            endPos,
            value,
            lastNumber;
          //needed to handle an IE "special" event
          if (key === undefined) {
            return false;
          }

          selection = getInputSelection();
          startPos = selection.start;
          endPos = selection.end;

          if (key === 8 || key === 46 || key === 63272) { // backspace or delete key (with special case for safari)
            preventDefault(e);

            value = $input.val();
            // not a selection
            if (startPos === endPos) {
              // backspace
              if (key === 8) {
                if (settings.suffix === "") {
                  startPos -= 1;
                } else {
                  // needed to find the position of the last number to be erased
                  lastNumber = value.split("").reverse().join("").search(/\d/);
                  startPos = value.length - lastNumber - 1;
                  endPos = startPos + 1;
                }
                //delete
              } else {
                endPos += 1;
              }
            }

            $input.val(value.substring(0, startPos) + value.substring(endPos, value.length));

            if ((key === Katrid.UI.Keyboard.keyCode.DELETE || key === Katrid.UI.Keyboard.keyCode.BACKSPACE) && !$input.val())
              return false;

            maskAndPosition(startPos);
            return false;
          } else if (key === 9) { // tab key
            return true;
          } else { // any other key
            return true;
          }
        }

        function focusEvent() {
          onFocusValue = $input.val();
          mask();
          var input = $input.get(0),
            textRange;
          if (input.createTextRange) {
            textRange = input.createTextRange();
            textRange.collapse(false); // set the cursor at the end of the input
            textRange.select();
          }
        }

        function cutPasteEvent() {
          setTimeout(function () {
            mask();
          }, 0);
        }

        function getDefaultMask() {
          var n = parseFloat("0") / Math.pow(10, settings.precision);
          return (n.toFixed(settings.precision)).replace(new RegExp("\\.", "g"), settings.decimal);
        }

        function blurEvent(e) {
          if ($.browser.msie) {
            keypressEvent(e);
          }
          if ($input.val() === "")
            return;

          if ($input.val() === setSymbol(getDefaultMask())) {
            if (!settings.allowZero) {
              $input.val("");
            } else if (!settings.affixesStay) {
              $input.val(getDefaultMask());
            } else {
              $input.val(setSymbol(getDefaultMask()));
            }
          } else {
            if (!settings.affixesStay) {
              var newValue = $input.val().replace(settings.prefix, "").replace(settings.suffix, "");
              $input.val(newValue);
            }
          }
          if ($input.val() !== onFocusValue) {
            $input.change();
          }
        }

        function clickEvent() {
          let input = $input.get(0),
            length;
          if (input.setSelectionRange) {
            input.select();
            return;
            length = $input.val().length;
            input.setSelectionRange(length, length);
          } else {
            $input.val($input.val());
          }
        }

        $input.unbind(".maskMoney");
        $input.bind("keypress.maskMoney", keypressEvent);
        $input.bind("keydown.maskMoney", keydownEvent);
        $input.bind("blur.maskMoney", blurEvent);
        $input.bind("focus.maskMoney", focusEvent);
        $input.bind("click.maskMoney", clickEvent);
        $input.bind("cut.maskMoney", cutPasteEvent);
        $input.bind("paste.maskMoney", cutPasteEvent);
        $input.bind("mask.maskMoney", mask);
      });
    }
  };

  $.fn.maskMoney = function (method) {
    if (methods[method]) {
      return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
    } else if (typeof method === "object" || !method) {
      return methods.init.apply(this, arguments);
    } else {
      $.error("Method " + method + " does not exist on jQuery.maskMoney");
    }
  };
})(window.jQuery || window.Zepto);
(function() {

  class DashboardView extends Katrid.UI.Views.ClientView {
    get templateUrl() {
      return 'view.dashboard';
    }
  }

  class DashboardComponent extends Katrid.UI.Widgets.Component {
    constructor($compile) {
      super();
      this.$compile = $compile;
      this.restrict = 'E';
      this.scope = false;
    }

    async link(scope, el, attrs, controller) {
      let dashboardId = attrs.dashboardId;
      let model = new Katrid.Services.Model('ir.dashboard.settings');
      let res = await model.search({ dashboard_id: dashboardId });
      if (res.data) {
        let content = res.data[0].content;
        content = this.$compile(content)(scope);
        el.append(content);
      }
    }
  }

  class Chart extends Katrid.UI.Widgets.Component {
    constructor() {
      super();
      this.replace = true;
      this.template = '<div></div>';
    }

    async link(scope, el, attrs) {
      let res, chart;

      let observe = async () => {
        if (_.isUndefined(attrs.url))
          res = await Katrid.Services.Query.read(attrs.queryId);
        else
          res = await $.ajax({
            url: attrs.url,
            type: 'get',
          });

        if (chart)
          chart.destroy();

        chart = c3.generate({
          bindto: el[0],
          data: {
            type: 'donut',
            columns: res.data
          }
        });
      };

      attrs.$observe('url', observe);

    }
  }

  class Query extends Katrid.UI.Widgets.Component {
    constructor() {
      super();
      this.scope = false;
    }
    link(scope, el, attrs) {
      if (!attrs.name)
        throw Error('Query name attribute is required!');
      let r;
      if (_.isUndefined(attrs.url))
        r = Katrid.Services.Query.read(attrs.id);
      else
        r = $.get(attrs.url);
      r.done(res => {
        let data = res.data.map((row) => (_.object(res.fields, row)));
        scope.$apply(() => scope[attrs.name] = data);
      });
      el.remove();
    }
  }

  Katrid.Actions.ClientAction.register('dashboard', DashboardView);

  Katrid.uiKatrid.directive('dashboard', DashboardComponent);
  Katrid.uiKatrid.directive('chart', Chart);
  Katrid.uiKatrid.directive('query', Query);

})();

(function () {

  class Alerts {
    static success(msg) {
      return toastr['success'](msg);
    }

    static warn(msg) {
      return toastr['warning'](msg);
    }

    static error(msg) {
      return toastr['error'](msg);
    }
  }

  class WaitDialog {
    static show() {
      $('#loading-msg').show();
    }

    static hide() {
      $('#loading-msg').hide();
    }
  }

  class Dialog extends Katrid.UI.Views.BaseView {
    constructor(scope, options, $compile) {
      super(scope);
      this.$compile = $compile;
      this.templateUrl = 'dialog.base';
      this.scope.isDialog = true;
    }

    render() {
      return $(sprintf(Katrid.$templateCache.get(this.templateUrl), { content: this.content }));
    }

    show() {
      if (!this.el) {
        this.el = $(this.render());
        this.root = this.el.find('.modal-dialog-body');
        this.el.find('form').first().addClass('row');
        this.$compile(this.el)(this.scope);
      }
      this.el.modal('show')
      .on('shown.bs.modal', () => Katrid.uiKatrid.setFocus(this.el.find('.form-field').first()));
      return this.el;
    }
}

  class Window extends Dialog {
    constructor(scope, options, $compile) {
      super(scope.$new(), options, $compile);
      this.templateUrl = 'dialog.window';
      console.log(Katrid.$templateCache.get(this.templateUrl));
      this.scope.parentAction = scope.action;
      console.log(options);
      this.scope.views = { form: options.view };
      this.scope.title = (options && options.title) || Katrid.i18n.gettext('Create: ');
      this.scope.view = options.view;
      this.content = options.view.content;
    }
  }

  let showWindow = (scope, field, view, $compile, $controller) => {
    const elScope = scope.$new();
    elScope.parentAction = scope.action;
    elScope.views = { form: view };
    elScope.isDialog = true;
    elScope.dialogTitle = Katrid.i18n.gettext('Create: ');
    let el = $(Katrid.UI.Utils.Templates.windowDialog(elScope));
    elScope.root = el.find('.modal-dialog-body');
    $controller('ActionController', {
        $scope: elScope,
        action: {
          model: [null, field.model],
          action_type: "ir.action.window",
          view_mode: 'form',
          view_type: 'form',
          display_name: field.caption
        }
      }
    );

    el = $compile(el)(elScope);
    el.modal('show').on('shown.bs.modal', () => Katrid.uiKatrid.setFocus(el.find('.form-field').first()));

    return el;
  };

  Katrid.Dialogs = {
    Alerts,
    WaitDialog,
    Dialog,
    Window
  };

}).call(this);
(function () {

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
    static get tag() {
      return 'input';
    }

    constructor(scope, attrs, field, element) {
      this.attrs = attrs;
      this.scope = scope;
      this.templAttrs = {};
      this.wAttrs = {};
      this.field = field;
      this.element = element;
      this.content = element.html();
      // this.inline = scope.inline;
      this.spanPrefix = '';

      // Check if field depends from another
      if ((field.depends != null) && field.depends.length)
        scope.dataSource.addFieldWatcher(field);

      if (attrs.ngShow)
        this.templAttrs['ng-show'] = attrs.ngShow;
      
      if (attrs.ngReadonly || field.readonly)
        this.templAttrs['ng-readonly'] = attrs.ngReadonly || field.readonly;

      if (field.attrs)
        for (let k of field.attrs) {
          v = field.attrs[k];
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
          if (field.max_length && (field.max_length < 30)) cols = 3;
        if (!cols)
          cols = DEFAULT_COLS[field.type] || 6;
      }

      this.col = cols;
      this.classes = ['form-field'];

      // track field changes
      if (field.onchange)
        scope.$watch();
    }

    fieldChangeEvent() {

    }

    get caption() {
      return this.element.attr('label') || this.field.caption;
    }

    renderTo(templTag, inplaceEditor=false, cls='') {
      let templAttrs = [];
      for (let [k, v] of Object.entries(this.templAttrs))
        templAttrs.push(k + '=' + '"' + v + '"');

      if (inplaceEditor)
        return `<${templTag} class="${cls}" ${templAttrs.join('')}>${this.template(this.scope, this.element, this.attrs, this.field)}</${templTag}>`;

      return `<${templTag} class="${this.field.type} section-field-${this.field.name} form-group" ${templAttrs.join('')}>` +
            this.template(this.scope, this.element, this.attrs, this.field) +
            `</${templTag}>`
    }

    get ngModel() {
      return `record.${this.field.name}`;
    }

    get id() {
      if (!this._id)
        this._id = ++WIDGET_COUNT;
      return `katrid-input-${this._id.toString()}`;
    }

    widgetAttrs() {
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
          } else if (attrName === 'class')
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
      const attributes = this.widgetAttrs(scope, el, attrs, field);
      for (let att in attributes) {
        const v = attributes[att];
        html += ` ${att}`;
        if (v || (v === false)) {
          if (_.isString(v) && (v.indexOf('"') > -1)) {
            html += `='${v}'`;
          } else {
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
      } else if (!_.isUndefined(this.attrs.nolabel))
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

    template() {
      let label = '';
      let span = this.spanTemplate();
      if (!this.inplaceEditor) {
        label = this.labelTemplate();
        // span =
      }
      let widget = this.widgetTemplate();
      if (this.inline === 'inline')
        widget = `<div ng-if="dataSource.changing && dataSource.recordIndex === $index">${widget}</div>`;
      return `<div>${label}${span}${widget}</div>`;
    }

    link(scope, el, attrs, $compile, field) {
      // Add watcher for field dependencies
      if (field.depends) {
        return (() => {
          const result = [];
          for (let dep of Array.from(field.depends)) {
            if (!Array.from(scope.dataSource.fieldChangeWatchers).includes(dep)) {
              scope.dataSource.fieldChangeWatchers.push(dep);
              result.push(scope.$watch(`record.${dep}`, function(newValue, oldValue) {
                // Ignore if dataSource is not in changing state
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
      return `<td class="${cls}">${ content }</td>`;
    }

    td() {
      if (this.content)
        return this.content;
      return this._td(`${this.field.type} field-${this.field.name}`);

      let colHtml = this.element.html();
      let s;
      let fieldInfo = this.field;
      let name = fieldInfo.name;
      let editor = '';
      if ((gridEditor === 'tabular') && html) editor = html;
      if (colHtml) {
        s = `<td><a data-id="{{::record.${name}[0]}}">${colHtml}</a>${editor}</td>`;
      } else if (fieldInfo.type === 'ForeignKey') {
        s = `<td><a data-id="{{::row.${name}[0]}}">{{row.${name}[1]}}</a>${editor}</td>`;
      } else if  (fieldInfo._listChoices) {
        s = `<td class="${cls}">{{::view.fields.${name}._listChoices[row.${name}]}}${editor}</td>`;
      } else if (fieldInfo.type === 'BooleanField') {
        s = `<td class="bool-text ${cls}">{{::row.${name} ? '${Katrid.i18n.gettext('yes')}' : '${Katrid.i18n.gettext('no')}'}}${editor}</td>`;
      } else if (fieldInfo.type === 'IntegerField') {
        s = `<td class="${cls}">{{::row.${name}|number}}${editor}</td>`;
      } else if (fieldInfo.type === 'DecimalField') {
        let decimalPlaces = this.element.attr('decimal-places') || 2;
        s = `<td class="${cls}">{{::row.${name}|number:${ decimalPlaces } }}${editor}</td>`;
      } else if (fieldInfo.type === 'DateField') {
        s = `<td class="${cls}">{{::row.${name}|date:'${Katrid.i18n.gettext('yyyy-mm-dd').replace(/[m]/g, 'M')}'}}${editor}</td>`;
      } else if (fieldInfo.type === 'DateTimeField') {
        s = `<td class="${cls}">{{::row.${name}|date:'${Katrid.i18n.gettext('yyyy-mm-dd').replace(/[m]/g, 'M')}'}}${editor}</td>`;
      } else {
        s = `<td>{{ ::row.${name} }}</td>`;
      }
      return s;
    }
  }


  class InputWidget extends Field {
    static get tag() {
      return 'input input-field';
    }

    constructor() {
      super(...arguments);
      this.classes.push('form-control');
    }

    get type() {
      return 'text';
    }

    widgetTemplate1() {
      let html;
      if (this.constructor.tag.startsWith('input')) {
        html = `<${this.tag} id="${attrs._id}" type="${type}" name="${attrs.name}" ${this._getWidgetAttrs(scope, el, attrs, field)}>`;
      } else {
        html = `<${this.tag} id="${attrs._id}" name="${attrs.name}" ${this._getWidgetAttrs(scope, el, attrs, field)}>`;
      }
      const inner = this.innerHtml(scope, el, attrs, field);
      if (inner) {
        html += inner + `</${this.tag}>`;
      }
      return html;
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


  class NumericField extends InputWidget {
    static get tag() {
      return 'input decimal';
    }

    get type() {
      if (Katrid.Settings.UI.isMobile)
        return 'number';
      return 'text';
    }

    spanTemplate() {
      return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|number) || '${this.emptyText}' }}</span>`;
    }
  }


  class IntegerField extends NumericField {
    static get tag() {
      return 'input decimal decimal-places="0"';
    }
  }


  class TimeField extends InputWidget {
    get type() {
      return 'time';
    }
  }


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


  class ForeignKey extends Field {
    static get tag() {
      return 'input foreignkey';
    }

    spanTemplate() {
      let allowOpen = true;
      if (((this.attrs.allowOpen != null) && (this.attrs.allowOpen === 'false')) || ((this.attrs.allowOpen == null) && this.field.attrs && (this.field.attrs['allow-open'] === false)))
        allowOpen = false;

      if (!allowOpen || this.inList)
        return `<span class="${this.readOnlyClass}"><a href="javascript:void(0)">{{ ${this.spanPrefix}record.${this.field.name}[1] || '${this.emptyText}' }}</a></span>`;

      return `<span class="${this.readOnlyClass}"><a href="#/action/${ this.field.model }/view/?id={{ ${this.spanPrefix}record.${this.field.name}[0] }}" ng-click="action.openObject('${ this.field.model }', record.${this.field.name}[0], $event, '${ this.field.caption }')">{{ ${this.spanPrefix}record.${this.field.name}[1] }}</a><span ng-if="!record.${this.field.name}[1]">--</span></span>`;
    }

    get type() {
      return 'hidden';
    }

    _tdContent() {
      return `{{record.${this.field.name}[1]}}`;
    }
  }


  class TextField extends StringField {
    static get tag() {
      return 'textarea';
    }
  }


  class FloatField extends NumericField {
    static get tag() {
      if (Katrid.Settings.UI.isMobile)
        return 'input';
      return 'input decimal';
    }

    get type() {
      if (Katrid.Settings.UI.isMobile)
        return 'number';
      return 'text';
    }

    spanTemplate() {
      let decimalPlaces = this.attrs.decimalPlaces || 2;
      return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|number:${ decimalPlaces }) || '${this.emptyText}' }}</span>`;
    }

    _tdContent() {
      let filter;
      let decimalPlaces = this.element.attr('decimal-places');
      if (decimalPlaces)
        filter `number:${ decimalPlaces }`;
      else
        filter = `numberFormat:${this.element.attr('max-digits') || 6}`;
      return `{{::record.${this.field.name}|${filter} }}`;
    }
  }


  class DecimalField extends FloatField {
    spanTemplate() {
      let maxDigits = this.attrs.maxDigits;
      let fmt = 'number';
      if (maxDigits)
        fmt = 'numberFormat';
      else
        maxDigits = this.attrs.decimalPlaces || 2;
      return `<span class="${this.readOnlyClass}">{{ ${this.spanPrefix}(record.${this.field.name}|${ fmt }:${ maxDigits }) || '${this.emptyText}' }}</span>`;
    }

    _tdContent(cls) {
      let maxDigits = this.element.attr('max-digits');
      if (maxDigits)
        return `<td class="${cls}">{{::record.${this.field.name}|numberFormat:${ maxDigits } }}${this._gridEditor()}</td>`;
      else {
        maxDigits = 2;
        return `{{::record.${this.field.name}|number:${ maxDigits } }}`;
      }
    }
  }


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

    // widgetTemplate() {
    //   return `<div class="input-group date" ng-show="dataSource.changing">${ super.widgetTemplate() }<div class="input-group-append"><button class="btn btn-default" type="button"><span class="fa fa-calendar"></span></button></div></div>`;
    // }

    _tdContent(cls) {
      return `{{::record.${this.field.name}|date:'${Katrid.i18n.gettext('yyyy-MM-dd')}'}}`;
    }
  }


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
      let html = his.element.html();
      if (html)
        return html;
      return '';
    }

  }


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


  class BooleanField extends InputWidget {
    spanTemplate() {
      return `<span class="${this.readOnlyClass} bool-text">
  {{${this.spanPrefix}record.${this.field.name} ? '${Katrid.i18n.gettext('yes')}' : '${Katrid.i18n.gettext('no')}'}}
  </span>`;
    }

    get type() {
      return 'checkbox';
    }

    _td(cls) {
      return super._td('bool-text ' + cls);
    }

    widgetTemplate() {
      let html = super.widgetTemplate();
      html = `<label class="checkbox" ng-show="dataSource.changing">${html}`;
      if (this.field.help_text) {
        html += this.field.help_text;
      } else {
        html += this.field.caption;
      }
      html += '<i></i></label>';
      return html;
    }

    labelTemplate() {
      if (this.field.help_text)
        return super.labelTemplate();
      return `<label for="${ this.id }" class="form-label form-label-checkbox"><span>${ this.caption }</span>&nbsp;</label>`;
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


  class ImageField extends FileField {
    static get tag() {
      return 'input file-reader accept="image/*"';
    }

    spanTemplate() { return ''; }

    widgetTemplate() {
      let html = super.widgetTemplate();
      let imgSrc = this.attrs.ngEmptyImage || (this.attrs.emptyImage && ("'" + this.attrs.emptyImage + "'")) || "'/static/web/static/assets/img/no-image.png'";
      html = `<div class="image-box image-field">
  <img ng-src="{{ record.${this.field.name} || ${imgSrc} }}" />
    <div class="text-right image-box-buttons">
    <button class="btn btn-default" type="button" title="${Katrid.i18n.gettext('Change')}" onclick="$(this).closest('.image-box').find('input').trigger('click')"><i class="fa fa-pencil"></i></button>
    <button class="btn btn-default" type="button" title="${Katrid.i18n.gettext('Clear')}" ng-click="$set('${this.field.name}', null)"><i class="fa fa-trash"></i></button>
    </div>
      ${html}</div>`;
      return html;
    }
  }


  class PasswordField extends InputWidget {

    get type() {
      return 'password';
    }

    spanTemplate() {
      return `<span class="form-field-readonly">*******************</span>`;
    }
  }


  class StatusField extends InputWidget {
    constructor(...args) {
      super(...args);
      this.col = null;
    }
    static get tag() {
      return 'status-field';
    }


    get type() {
      return 'hidden';
    }

    renderTo() {
      return `<status-field id="${this.id}" name="${this.field.name}" ng-model="record.${this.field.name}"/>`;
    }
  }


  Object.assign(this.Katrid.UI.Widgets,
    {
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
      StatusField
    }
  );
})();

(function () {
  const uiKatrid = Katrid.uiKatrid;

  uiKatrid.filter('numberFormat', () => {
    return (value, maxDigits = 3) => {
      if (value == null)
        return '';
      return new Intl.NumberFormat('pt-br', { maximumSignificantDigits: maxDigits }).format(value);
    }
  });

})();
(function () {
  let uiKatrid = Katrid.uiKatrid;

  uiKatrid.directive('inlineForm', $compile => ({
    restrict: 'A',
    scope: {}
  }));

  class Grid {
    constructor($compile) {
      this.restrict = 'E';
      this.replace = true;
      this.scope = {};
      this.$compile = $compile;
    }

    link(scope, element, attrs) {
      let me = this;
      // Load remote field model info

      const field = scope.$parent.view.fields[attrs.name];

      scope.action = scope.$parent.action;
      scope.fieldName = attrs.name;
      scope.field = field;
      scope.records = [];
      scope.recordIndex = -1;
      scope._cachedViews = {};
      scope._ = scope.$parent._;
      scope._changeCount = 0;
      scope.dataSet = [];
      scope.parent = scope.$parent;
      scope.model = new Katrid.Services.Model(field.model);
      scope.isList = true;

      if (attrs.inlineEditor === 'tabular')
        scope.inline = 'tabular';
      else if (attrs.hasOwnProperty('inlineEditor'))
        scope.inline = 'inline';

      scope.getContext = function () {
        return {}
      };

      scope.$setDirty = function () {
        return {}
      };

      // Set parent/master data source
      let dataSource = scope.dataSource = new Katrid.Data.DataSource(scope);
      dataSource.readonly = !_.isUndefined(attrs.readonly);
      let p = scope.$parent;
      while (p) {
        if (p.dataSource) {
          scope.dataSource.masterSource = p.dataSource;
          break;
        }
        p = p.$parent;
      }

      scope.dataSource.fieldName = scope.fieldName;
      scope.gridDialog = null;
      let gridEl = null;
      // check if element already has the list view template
      let lst = element.find('list');
      if (lst.length)
        scope.model.getFieldsInfo({view_type: 'list'})
        .then(res => {
          loadViews({
            list: {
              content: lst,
              fields: res.result
            }
          })
        });
      else {
        scope.model.loadViews()
        .then(res => {
          // detects the relational field
          let fld = res.views.list.fields[scope.field.field];
          if (fld)
            fld.visible = false;
          loadViews(res.views);
          scope.$apply();
        })
      }

      let renderDialog = function () {
        let el;
        let html = scope._cachedViews.form.content;

        scope.view = scope._cachedViews.form;
        let fld = scope._cachedViews.form.fields[scope.field.field];
        if (fld)
          fld.visible = false;

        if (attrs.inline) {
          el = me.$compile(html)(scope);
          gridEl.find('.inline-input-dialog').append(el);
        } else {
          html = $(Katrid.$templateCache.get('view.field.OneToManyField.Dialog').replace('<!-- view content -->', html));
          el = me.$compile(html)(scope);
          el.find('form').first().addClass('row');
        }

        // Get the first form controller
        scope.formElement = el.find('form').first();
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
        const def = new $.Deferred();
        el.on('shown.bs.modal', () => def.resolve());
        return def;
      };

      let _destroyChildren = () => {
        dataSource.children = [];
      };

      let loadViews = (obj) => {
        scope._cachedViews = obj;
        scope.view = scope._cachedViews.list;
        let onclick = 'openItem($index)';
        if (scope.inline === 'tabular')
          onclick = '';
        else if (scope.inline === 'inline')
          onclick = 'editItem($event, $index)';
        const html = Katrid.UI.Utils.Templates.renderGrid(scope, $(scope.view.content), attrs, onclick);
        gridEl = this.$compile(html)(scope);
        element.replaceWith(gridEl);
        // if (attrs.inline === 'inline') {
        //   return renderDialog();
        // }
        return gridEl;
      };

      scope.doViewAction = (viewAction, target, confirmation) => scope.action._doViewAction(scope, viewAction, target, confirmation);

      let _cacheChildren = (fieldName, record, records) => {
        record[fieldName] = records;
      };

      scope._incChanges = () => {
        //return scope.parent.record[scope.fieldName] = scope.records;
      };

      scope.addItem = function () {
        scope.dataSource.insert();
        console.log(attrs.$attr.inlineEditor);
        if (attrs.$attr.inlineEditor)
          scope.records.push(scope.record);
        else
          return scope.showDialog();
      };

      scope.addRecord = function (rec) {
        let record = Katrid.Data.createRecord({}, scope.dataSource);
        for (let [k, v] of Object.entries(rec))
          record[k] = v;
        scope.records.push(record);
      };

      scope.cancelChanges = () => scope.dataSource.setState(Katrid.Data.DataSourceState.browsing);

      scope.openItem = index => {
        scope.showDialog(index);
        if (scope.parent.dataSource.changing && !scope.dataSource.readonly) {
          return scope.dataSource.edit();
        }
      };

      scope.editItem = (evt, index) => {
        if (scope.$parent.dataSource.changing) {
          scope.dataSource.recordIndex = index;
          scope.dataSource.edit();

          // delay focus field
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
        //scope.$parent.record.$modifiedData[scope.fieldName].$deleted.append(rec);
        // return scope.dataSource.applyModifiedData(null, null, rec);
      };

      scope.$set = (field, value) => {
        const control = scope.form[field];
        control.$setViewValue(value);
        control.$render();
      };

      scope.save = function () {
        // const data = scope.dataSource.applyModifiedData(scope.form, scope.gridDialog, scope.record);
        if (scope.inline)
          return;
          // return scope.$parent.record[scope.fieldName] = scope.records;
        if (scope.recordIndex > -1) {
          let rec = scope.record;
          scope.record = null;
          scope.records.splice(scope.recordIndex, 1);
          setTimeout(() => {
            scope.records.splice(scope.recordIndex, 0, rec);
            scope.$apply();
          });
        } else if (scope.recordIndex === -1) {
          scope.records.push(scope.record);
          scope.$parent.record[scope.fieldName] = scope.records;
        }
        if (!scope.inline) {
          scope.gridDialog.modal('toggle');
        }
        scope._incChanges();
      };


      let _loadChildFromCache = (child) => {
        if (scope.record.hasOwnProperty(child.fieldName)) {
          child.scope.records = scope.record[child.fieldName];
        }
      };


      scope.showDialog = function (index) {

        let needToLoad = false;

        if (index != null) {
          // Show item dialog
          scope.recordIndex = index;

          if (scope.records[index] && !scope.records[index].$loaded) {
            scope.dataSource.get(scope.records[index].id, 0, false, index)
            .then(res => {
              res.$loaded = true;
              scope.records[index] = res;
              scope.dataSource.edit();

              // load nested data
              let currentRecord = scope.record;
              if (res.id)
                for (let child of dataSource.children) {
                  child.scope.masterChanged(res.id)
                  .then(res => {
                    _cacheChildren(child.fieldName, currentRecord, res.data);
                  })

              }
            });

          }
          else {
            needToLoad = true;
          }

        } else
          scope.recordIndex = -1;

        let done = () => {
          if (needToLoad) {
            scope.record = scope.records[index];
            for (let child of dataSource.children)
              _loadChildFromCache(child);
            scope.$apply();
          }

        };

        if (scope._cachedViews.form) {
          renderDialog().then(done);
        } else {
          scope.model.getViewInfo({view_type: 'form'})
          .then(function (res) {
            if (res.result) {
              scope._cachedViews.form = res.result;
              return renderDialog().then(done);
            }
          });
        }

      };

      const masterChanged = scope.masterChanged = (key) => {
        // Ajax load nested data
        scope.dataSet = [];
        scope._changeCount = 0;
        scope.records = [];
        if (key != null) {
          const data = {};
          data[field.field] = key;
          if (key)
            return scope.dataSource.search(data)
            .finally(() => scope.dataSource.state = Katrid.Data.DataSourceState.browsing);
        }
      };

      if (!scope.$parent.isList) {
        dataSource.invalidate = masterChanged;
        // scope.$parent.$watch('recordId', masterChanged);
      }
    }

  }

  uiKatrid.directive('grid', Grid);

})();
(() => {

  const uiKatrid = angular.module('ui.katrid', []);

  Katrid.UI = {
    Keyboard: {
      keyCode: {
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
      }
    },
    toggleFullScreen() {
      if (!document.fullscreenElement &&
        !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
          document.documentElement.msRequestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
          document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    }
  };


  Katrid.uiKatrid = uiKatrid;
})();


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
        }
        , 1000);
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
        for (let f of this.scope.files) files.push(f.file);
        var me = this;
        Katrid.Services.Attachments.upload({files: files}, this.scope)
        .done((res) => {
          me._sendMesage(msg, res);
        });
      } else
        this._sendMesage(msg);
    }
  }


  Katrid.uiKatrid.directive('comments', () =>
    ({
      restrict: 'E',
      scope: {},
      replace: true,
      template: '<div class="content"><div class="comments"><mail-comments/></div></div>',
      link(scope, element, attrs) {
        $(element).closest('form-view[ng-form=form]').find('.content-scroll>.content').append(element);
      }
    })
  );

  Katrid.uiKatrid.directive('mailComments', () =>
    ({
      restrict: 'E',
      controller: ($scope) => {
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
        }
      },
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
                <li ng-repeat="file in files" ng-click="deleteFile($index)" title="${ Katrid.i18n.gettext('Delete this attachment') }">{{ file.name }}</li>
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
              <strong>{{ ::comment.author[1] }}</strong> - <span class="timestamp text-muted" title="{{ ::comment.date_time|moment:'LLLL'}}"> {{::comment.date_time|moment}}</span>
              <div class="clearfix"></div>
              <div class="form-group">
                {{::comment.content}}
              </div>
              <div class="form-group" ng-if="comment.attachments">
                <ul class="list-inline">
                  <li ng-repeat="file in comment.attachments"><a href="/web/content/{{ ::file.id }}/?download">{{ ::file.name }}</a></li>
                </ul>
              </div>
            </div>
          </div>
    </div>`;
      }
    })
  );


  class MailFollowers {}


  class MailComments extends Katrid.UI.Widgets.Widget {
    static initClass() {
      this.prototype.tag = 'mail-comments';
    }

    spanTemplate(scope, el, attrs, field) {
      return '';
    }
  }
  MailComments.initClass();


  Katrid.UI.Widgets.MailComments = MailComments;

}).call(this);

/**
 * Created by alexandre on 29/12/2017.
 */


let _isSetEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (var ai of a) if (!b.has(ai)) return false;
  return true;
};


class DataCube {
  constructor(data) {
    this.source = data;
    this.data = [];
    this.cells = [];
    this.fields = [];
    this.xFields = [];
    this.yFields = [];
    this.measures = [];
  }

  groupBy() {
    let lastGroup = [], newGroup, summary = {}, curVals, val, v, keep;

    let rows = [], cols = [], cells = [], xIndices = {}, yIndices = {};

    let xfields, yfields, yValues, xValues, colCount = 0, rowCount = 0;
    if (this.xFields.length) xfields = this.xFields;
    else xfields = [null];
    if (this.yFields.length) yfields = this.yFields;
    else yfields = [null];

    let fields = [], f, i;
    let x = 0, y = 0;
    let xbr = false, ybr = false;


    for (let row of this.source) {
      newGroup = [];
      xValues = [];
      yValues = [];

      // check grouping and generate cells
      keep = true;
      i = 0;
      for (f of yfields) {
        v = row[f];
        newGroup.push(v);
        yValues.push(v);
        if (lastGroup[i] !== v) {
          keep = false;
          ybr = true;
          i = yfields.length - i;
          while (--i>0) newGroup.push(null);
          break;
        }
        i++;
      }

      for (f of xfields) {
        v = row[f];
        newGroup.push(v);
        xValues.push(v);
        if (lastGroup[i] !== v) {
          keep = false;
          xbr = true;
          i = xfields.length - i;
          while (--i>0) newGroup.push(null);
          break;
        }
        i++;
      }

      if (!keep) {
        var groupHash = newGroup.toString();
        if (summary[groupHash] === undefined) {
          lastGroup = newGroup;
          if (ybr) {
            var yHash = yValues.toString();
            y = yIndices[yHash];
            if (y === undefined) {
              y = rows.length;
              yIndices[yHash] = y;
              rows.push(yValues);
              cells.push([]);
            }
          }
          if (xbr) {
            var xHash = xValues.toString();
            x = xIndices[xHash];
            if (x === undefined) {
              x = cols.length;
              xIndices[xHash] = x;
              cols.push(xValues);
            }
          }
          var newVals = {};
          for (val of this.measures) {
            var cell = {};
            newVals[val] = cell;
            cell.value = 0;
            cell.count = 0;
            if (xbr) cells[y].push(cell);
          }
          summary[groupHash] = newVals;
        }
        curVals = summary[groupHash];
        //rows.push();
      }
      for (val of this.measures) {
        cell = curVals[val];
        cell.value += row[val];
        cell.count++;
      }
    }
    console.log('cells', cells);
    //console.log('cols', cols);
    console.log(summary);
  }
}

let testCube = () => {
  let data = [];

  for (var i=0;i<300000;i++) {
    data.push({
      name: 'Person ' + i,
      groupName: 'Group' + i.toString()[0],
      groupName2: 'Group2-' + Math.floor((Math.random() * 10) + 1).toString(),
      value: i
    })
  }

  console.log(data);

  let cube = new DataCube(data);
  console.time('group');
  cube.xFields = ['groupName'];
  cube.yFields = ['groupName2'];
  cube.measures = ['value'];
  cube.groupBy();
  console.timeEnd('group');
};

console.time('testCube');
testCube();
console.timeEnd('testCube');

(function () {
  let _counter = 0;


  class Reports {
    static initClass() {
      this.currentReport = {};
      this.currentUserReport = {};
    }

    static get(repName) {}

    static renderDialog(action) {
      return Katrid.$templateCache.get('view.report');
    }
  }
  Reports.initClass();


  class Report {
    constructor(action, scope) {
      this.action = action;
      this.scope = scope;
      this.info = this.action.info;
      Katrid.Reports.Reports.currentReport = this;
      if ((Params.Labels == null)) {
        Params.Labels = {
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

    getUserParams() {
      const report = this;
      const params = {
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

      const fields = report.container.find('#report-id-fields').val();
      params['fields'] = fields;

      const totals = report.container.find('#report-id-totals').val();
      params['totals'] = totals;

      const sorting = report.container.find('#report-id-sorting').val();
      params['sorting'] = sorting;

      const grouping = report.container.find('#report-id-grouping').val();
      params['grouping'] = grouping;

      return params;
    }

    loadFromXml(xml) {
      if (_.isString(xml)) {
        xml = $(xml);
      }
      this.scope.customizableReport = xml.attr('customizableReport');
      this.scope.advancedOptions = xml.attr('advancedOptions');
      const fields = [];

      for (let f of Array.from(xml.find('field'))) {
        f = $(f);
        const name = f.attr('name');
        const label = f.attr('label') || (this.info.fields[name] && this.info.fields[name].caption) || name;
        const groupable = f.attr('groupable');
        const sortable = f.attr('sortable');
        const total = f.attr('total');
        const param = f.attr('param');
        const required = f.attr('required');
        const autoCreate = f.attr('autoCreate') || required;
        const operation = f.attr('operation');
        let type = f.attr('type');
        const modelChoices = f.attr('model-choices');
        if (!type && modelChoices) type = 'ModelChoices';
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
          autoCreate
        });
      }

      const params = (Array.from(xml.find('param')).map((p) => $(p).attr('name')));

      return this.load(fields, params);
    }

    saveDialog() {
      const params = this.getUserParams();
      const name = window.prompt(Katrid.i18n.gettext('Report name'), Katrid.Reports.Reports.currentUserReport.name);
      if (name) {
        Katrid.Reports.Reports.currentUserReport.name = name;
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

      // Create params
      for (let p of fields) {
        if (p.groupable)
          this.groupables.push(p);
        if (p.sortable)
          this.sortables.push(p);
        if (p.total)
          this.totals.push(p);
        if (!p.autoCreate) p.autoCreate = params.includes(p.name);
      }
    }

    loadParams() {
      for (let p of Array.from(this.fields))
        if (p.autoCreate)
          this.addParam(p.name);
    }

    addParam(paramName) {
      for (let p of Array.from(this.fields))
        if (p.name === paramName) {
          p = new Param(p, this);
          this.params.push(p);
          //$(p.render(@elParams))
          break;
        }
    }

    getValues() {}


    export(format) {
      if (format == null)
        format = localStorage.katridReportViewer || 'pdf';
      const params = this.getUserParams();
      const svc = new Katrid.Services.Model('ir.action.report');
      svc.post('export_report', { args: [this.info.id], kwargs: { format, params } })
      .then(function(res) {
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
      const flds = this.fields.map(p => `<option value="${p.name}">${p.label}</option>`).join('');
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
        for (p of Array.from(this.fields)) result2.push({id: p.name, text: p.label});
        return result2;
      })()) })
      .select2("container").find("ul.select2-choices").sortable({
          containment: 'parent',
          start() { return sel.select2("onSortStart"); },
          update() { return sel.select2("onSortEnd"); }
      });
      if (Katrid.Reports.Reports.currentUserReport.params && Katrid.Reports.Reports.currentUserReport.params.fields) {
        console.log(Katrid.Reports.Reports.currentUserReport.params.fields);
        sel.select2('val', Katrid.Reports.Reports.currentUserReport.params.fields);
      }
      //sel.data().select2.updateSelection([{ id: 'vehicle', text: 'Vehicle'}])
      sel = el.find('#report-id-totals');
      sel.append(aggs)
      .select2({ tags: ((() => {
        const result3 = [];
        for (p of Array.from(this.fields)) {         if (p.total) {
            result3.push({ id: p.name, text: p.label });
          }
        }
        return result3;
      })()) })
      .select2("container").find("ul.select2-choices").sortable({
          containment: 'parent',
          start() { return sel.select2("onSortStart"); },
          update() { return sel.select2("onSortEnd"); }
      });
      return el;
    }

    renderParams(container) {
      let p;
      const el = $('<div></div>');
      this.elParams = el;
      const loaded = {};

      const userParams = Katrid.Reports.Reports.currentUserReport.params;
      if (userParams && userParams.data) {
        for (p of Array.from(userParams.data)) {
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
      } else {
        container.find("#params-sorting").hide();
      }

      if (this.groupables.length) {
        el = this.renderGrouping(container);
      } else {
        container.find("#params-grouping").hide();
      }

      return el = this.renderParams(container);
    }
  }


  class Params {
    static initClass() {
      this.Operations = {
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

      this.DefaultOperations = {
        CharField: this.Operations.exact,
        IntegerField: this.Operations.exact,
        DateTimeField: this.Operations.between,
        DateField: this.Operations.between,
        FloatField: this.Operations.between,
        DecimalField: this.Operations.between,
        ForeignKey: this.Operations.exact,
        ModelChoices: this.Operations.exact
      };

      this.TypeOperations = {
        CharField: [this.Operations.exact, this.Operations.in, this.Operations.contains, this.Operations.startswith, this.Operations.endswith, this.Operations.isnull],
        IntegerField: [this.Operations.exact, this.Operations.in, this.Operations.gt, this.Operations.lt, this.Operations.between, this.Operations.isnull],
        FloatField: [this.Operations.exact, this.Operations.in, this.Operations.gt, this.Operations.lt, this.Operations.between, this.Operations.isnull],
        DecimalField: [this.Operations.exact, this.Operations.in, this.Operations.gt, this.Operations.lt, this.Operations.between, this.Operations.isnull],
        DateTimeField: [this.Operations.exact, this.Operations.in, this.Operations.gt, this.Operations.lt, this.Operations.between, this.Operations.isnull],
        DateField: [this.Operations.exact, this.Operations.in, this.Operations.gt, this.Operations.lt, this.Operations.between, this.Operations.isnull],
        ForeignKey: [this.Operations.exact, this.Operations.in, this.Operations.isnull],
        ModelChoices: [this.Operations.exact, this.Operations.in, this.Operations.isnull]
      };

      this.Widgets = {
        CharField(param) {
          return `<div><input id="rep-param-id-${param.id}" ng-model="param.value1" type="text" class="form-control"></div>`;
        },

        IntegerField(param) {
          let secondField = '';
          if (param.operation === 'between') {
            secondField = `<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" ng-model="param.value2" type="text" class="form-control"></div>`;
          }
          return `<div class="row"><div class="col-sm-6"><input id="rep-param-id-${param.id}" type="number" ng-model="param.value1" class="form-control"></div>${secondField}</div>`;
        },

        DecimalField(param) {
          let secondField = '';
          if (param.operation === 'between') {
            secondField = `<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" ng-model="param.value2" type="text" class="form-control"></div>`;
          }
          return `<div class="col-sm-6"><input id="rep-param-id-${param.id}" type="number" ng-model="param.value1" class="form-control"></div>${secondField}`;
        },

        DateTimeField(param) {
          let secondField = '';
          if (param.operation === 'between') {
            secondField = `<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" type="datetime-local" ng-model="param.value2" class="form-control"></div>`;
          }
          return `<div class="row"><div class="col-xs-6"><input id="rep-param-id-${param.id}" type="date" ng-model="param.value1" class="form-control"></div>${secondField}</div>`;
        },

        DateField(param) {
          let secondField = '';
          if (param.operation === 'between') {
            secondField = `<div class="col-xs-6"><input id="rep-param-id-${param.id}-2" type="date" ng-model="param.value2" class="form-control"></div>`;
          }
          return `<div class="col-sm-12 row"><div class="col-xs-6"><input id="rep-param-id-${param.id}" type="date" ng-model="param.value1" class="form-control"></div>${secondField}</div>`;
        },

        ForeignKey(param) {
          const serviceName = param.params.info.model;
          let multiple = '';
          if (param.operation === 'in') {
            multiple = 'multiple';
          }
          return `<div><input id="rep-param-id-${param.id}" ajax-choices="/api/rpc/${serviceName}/get_field_choices/" field="${param.name}" ng-model="param.value1" ${multiple}></div>`;
        },

        ModelChoices(param) {
          console.log('model choices', param);
          return `<div><input id="rep-param-id-${param.id}" ajax-choices="/api/reports/model/choices/" model-choices="${param.info.modelChoices}" ng-model="param.value1"></div>`;
        }
      };
    }
  }
  Params.initClass();


  class Param {
    constructor(info, params) {
      this.info = info;
      this.params = params;
      this.name = this.info.name;
      this.label = this.info.label;
      this.field = this.params.info.fields && this.params.info.fields[this.name];
      this.static = this.info.param === 'static' || this.field.param === 'static';
      this.type = this.info.type || (this.field && this.field.type) || 'CharField';
      this.defaultOperation = this.info.default_operation || Params.DefaultOperations[this.type];
      this.operation = this.defaultOperation;
      // @operations = @info.operations or Params.TypeOperations[@type]
      this.operations = this.getOperations();
      this.exclude = this.info.exclude;
      this.id = ++_counter;
    }

    defaultValue() {
      return null;
    }

    setOperation(op, focus) {
      if (focus == null) { focus = true; }
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
      widget = Katrid.core.compile(widget)(scope);
      return el.append(widget);
    }

    getOperations() { return (Array.from(Params.TypeOperations[this.type]).map((op) => ({ id: op, text: Params.Labels[op] }))); }

    operationTemplate() {
      const opts = this.getOperations();
      return `<div class="col-sm-4"><select id="param-op-${this.id}" ng-model="param.operation" ng-init="param.operation='${this.defaultOperation}'" class="form-control" onchange="$('#param-${this.id}').data('param').change();$('#rep-param-id-${this.id}')[0].focus()">
  ${opts}
  </select></div>`;
    }

    template() {
      let operation = '';
      if (!this.operation) operation = this.operationTemplate();
      return `<div id="param-${this.id}" class="row form-group" data-param="${this.name}" ng-controller="ParamController"><label class="control-label">${this.label}</label>${operation}<div id="param-widget-${this.id}"></div></div>`;
    }

    render(container) {
      this.el = this.params.scope.compile(this.template())(this.params.scope);
      this.el.data('param', this);
      this.createControls(this.el.scope());
      return container.append(this.el);
    }
  }


  Katrid.uiKatrid.controller('ReportController', function($scope, $element, $compile) {
    const xmlReport = $scope.$parent.action.info.content;
    const report = new Report($scope.$parent.action, $scope);
    $scope.report = report;
    console.log(report);
    report.loadFromXml(xmlReport);
    report.render($element);
    return report.loadParams();
  });


  Katrid.uiKatrid.controller('ReportParamController', function($scope, $element) {
    $scope.$parent.param.el = $element;
    $scope.$parent.param.scope = $scope;
    return $scope.$parent.param.setOperation($scope.$parent.param.operation, false);
  });


  class Telegram {
    static export(report, format) {

      let templ = Katrid.$templateCache.get('reportbot.dilaog.contacts');
      let modal = $(templ);
      $('body').append(modal);

      let sel = modal.find('#id-reportbot-select-contacts');
      let contacts = new Katrid.Services.Model('res.partner').post('get_telegram_contacts')
      .done(res => {
        if (res)
          res.map(c => sel.append(`<option value="${ c[0] }">${ c[1] }</option>`));
        sel.select2();
      });
      modal.find('#id-btn-ok').click(() => {

        let svc = new Katrid.Services.Model('telegram.pending');
        format = 'pdf';
        const params = report.getUserParams();
        svc.post('export_report', { args: [report.info.id], kwargs: { contacts: sel.val(), format, params } })
        .done(function(res) {
          if (res.ok) console.log('ok');
        });

      });
      modal.modal();
      return true;

    }
  }


  this.Katrid.Reports = {
    Reports,
    Report,
    Telegram,
    Param
  };
})();
(function() {

  let conditionsLabels = {
    '=': Katrid.i18n.gettext('Is equal'),
    '!=': Katrid.i18n.gettext('Is different'),
    '>': Katrid.i18n.gettext('Greater-than'),
    '<': Katrid.i18n.gettext('Less-than'),
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
  };

  class SearchMenu {
    constructor(element, parent, options) {
      this.element = element;
      this.parent = parent;
      this.options = options;
      this.input = this.parent.find('.search-view-input');
      this.input.on('input', evt => {
        if (this.input.val().length) {
          return this.show();
        } else {
          return this.close();
        }
    }).on('keydown', evt => {
        switch (evt.which) {
          case $.ui.keyCode.BACKSPACE:
            if (this.input.val() === '') {
              const item = this.searchView.query.items[this.searchView.query.items.length-1];
              this.searchView.onRemoveItem(evt, item);
            }
            break;
        }
        }).on('blur', evt => {
        this.input.val('');
        return this.close();
      });
    }

    link() {
      return this.element.hide();
    }

    show() {
      this.element.show();
      return this.searchView.first();
    }

    close() {
      this.element.hide();
      this.reset();
    }

    async expand(item) {
      let res = await this.searchView.scope.model.getFieldChoices(item.ref.name, this.searchView.scope.search.text);
      console.log(res);
      return res.items.map((obj) => this.searchView.loadItem(item.item, obj, item));
    }

    collapse(item) {
      for (let i of Array.from(item.children)) {
        i.destroy();
      }
      return item.children = [];
    }

    reset() {
      for (let i of this.searchView.items)
        if (i.children) {
          this.collapse(i);
          i.reset();
        }
    }

    select(evt, item) {
      if (this.options.select) {
        if (item.parentItem) {
          item.parentItem.value = item.value;
          item = item.parentItem;
        }
        item.searchString = this.input.val();
        this.options.select(evt, item);
        return this.input.val('');
      }
    }
  }


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
      } else {
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

    init(item, values) {
      this.item = item;
      if (values)
        this.values = values;
      else
        this.values = [{searchString: this.item.getDisplayValue(), value: this.item.value}];
    }

    addValue(item) {
      this.item = item;
      return this.values.push({searchString: this.item.getDisplayValue(), value: this.item.value});
    }

    templateValue() {
      const sep = ` <span class="facet-values-separator">${Katrid.i18n.gettext('or')}</span> `;
      return (Array.from(this.values).map((s) => s.searchString)).join(sep);
    }

  //   template() {
  //     const s = `<span class="facet-label">${this.item.getFacetLabel()}</span>`;
  //     return `<div class="facet-view">
  // ${s}
  // <span class="facet-value">${this.templateValue()}</span>
  // <span class="fa fa-sm fa-remove facet-remove"></span>
  // </div>`;
  //   }

    link(searchView) {
      const html = $(this.template());
      this.item.facet = this;
      this.element = html;
      const rm = html.find('.facet-remove');
      rm.click(evt => searchView.onRemoveItem(evt, this.item));
      return html;
    }

    refresh() {
      return this.element.find('.facet-value').html(this.templateValue());
    }

    load(searchView) {
      searchView.query.loadItem(this.item);
      this.render(searchView);
    }

    destroy() {
      this.item.clear();
    }

    getParamValues() {
      const r = [];
      for (let v of this.values) {
        r.push(this.item.getParamValue(this.item.name, v));
      }
      if (r.length > 1) {
        return [{'OR': r}];
      }
      return r;
    }
  }


  class _SearchItem {
    constructor(name, item, parent, ref, menu) {
      this.name = name;
      this.item = item;
      this.parent = parent;
      this.ref = ref;
      this.menu = menu;
      this.label = this.item.attr('label') || (this.ref && this.ref['caption']) || this.name;
    }

    templateLabel() {
      return sprintf(Katrid.i18n.gettext(`Search <i>%(caption)s</i> by: <strong>%(text)s</strong>`), {
        caption: this.label,
        text: '{{search.text}}'
      });
    }

    template() {
      let s = '';
      if (this.expandable)
        s = `<a class="expandable" href="#"></a>`;
      if (this.value)
        s = `<a class="search-menu-item indent" href="#">${this.value[1]}</a>`;
      else
        s += `<a href="#" class="search-menu-item">${this.templateLabel()}</a>`;
      return `<li>${s}</li>`;
    }

    link(action, $compile, parent) {
      const html = $compile(this.template())(action);
      if (parent != null) {
        html.insertAfter(parent.element);
        parent.children.push(this);
        this.parentItem = parent;
      } else
        html.appendTo(this.parent);

      this.element = html;

      this.itemEl = html.find('.search-menu-item').click(evt => evt.preventDefault()).mousedown(evt => {
        return this.select(evt);
      }).mouseover(function(evt) {
        const el = html.parent().find('>li.active');
        if (el !== html) {
          el.removeClass('active');
          return html.addClass('active');
        }
      });

      this.element.data('searchItem', this);

      this.expand = html.find('.expandable').on('mousedown', evt => {
        this.expanded = !this.expanded;
        evt.stopPropagation();
        evt.preventDefault();
        $(evt.target).toggleClass('expandable expanded');
        if (this.expanded) {
          return this.searchView.menu.expand(this);
        } else {
          return this.searchView.menu.collapse(this);
        }
      }).click(evt => evt.preventDefault());
      return false;
    }

    select(evt) {
      if (evt) {
        evt.stopPropagation();
        evt.preventDefault();
      }
      this.menu.select(evt, this);
      return this.menu.close();
    }

    getFacetLabel() {
      return this.label;
    }

    getDisplayValue() {
      if (this.value) {
        return this.value[1];
      }
      return this.searchString;
    }

    getValue() {
      return this.facet.values.map(s => s.value || s.searchString);
    }

    getParamValue(name, value) {
      const r = {};
      if ($.isArray(value)) {
        r[name] = value[0];
      } else {
        r[name + '__icontains'] = value;
      }
      return r;
    }

    getParamValues() {
      const r = [];
      for (let v of Array.from(this.getValue())) {
        r.push(this.getParamValue(this.name, v));
      }
      if (r.length > 1) {
        return [{'OR': r}];
      }
      return r;
    }

    destroy() {
      return this.element.remove();
    }

    remove() {
      this.searchView.removeItem(this);
    }

    reset() {
      this.expanded = false;
      this.expand.removeClass('expanded');
      return this.expand.addClass('expandable');
    }

    onSelect() {
      // do nothing
    }

    onRemove() {
      this.facet.element.remove();
      delete this.facet;
    }
  }


  class SearchField extends _SearchItem {
    constructor(name, item, parent, ref, menu) {
      super(name, item, parent, ref, menu);
      if (ref.type === 'ForeignKey') {
        this.expandable = true;
        this.children = [];
      } else {
        this.expandable = false;
      }
    }
  }


  class _SearchFilter extends _SearchItem {
    constructor(name, item, parent, ref, menu) {
      super(name, item, parent, ref, menu);
      this.domain = JSON.parse(item.attr('domain').replace(/'/g, '"'));
    }
    link(scope, $compile, parent) {
      const ul = this.searchView.toolbar.find('.search-view-filter-menu');
      let el = $(`<a class="dropdown-item" href="javascript:void(0)">${this.label}</a>`);
      this._toggleMenuEl = el;
      let me = this;
      el.click(function(evt) {
        evt.preventDefault();
        let e = $(this);
        if (me.facet) me.remove();
        else me.select();
      });
      return ul.append(el);
    }

    select(el) {
      super.select(null);
    }

    getFacetLabel() {
      return '<span class="fa fa-filter"></span>';
    }

    getDisplayValue() {
      return this.label;
    }

    onSelect() {
      this._toggleMenuEl.addClass('selected');
    }

    onRemove() {
      this._toggleMenuEl.removeClass('selected');
      super.onRemove();
    }

    getParamValue() {
      return this.domain;
    }

  }


  class SearchGroup extends _SearchItem {
    constructor(name, item, parent, ref, menu) {
      super(name, item, parent, ref, menu);
      const ctx = item.attr('context');
      if (typeof ctx === 'string') {
        this.context = JSON.parse(ctx);
      } else {
        this.context =
          {grouping: [name]};
      }
    }

    getFacetLabel() {
      return '<span class="fa fa-bars"></span>';
    }

    templateLabel() {
      return Katrid.i18n.gettext('Group by:') + ' ' + this.label;
    }

    getDisplayValue() {
      return this.label;
    }
  }


  class SearchView1 extends Katrid.UI.Widgets.Widget {
    constructor(scope) {
      super(scope);
      this.action = scope.action;
      scope.search = {};
      this.inputKeyDown = this.inputKeyDown.bind(this);
      this.onSelectItem = this.onSelectItem.bind(this);
      this.onRemoveItem = this.onRemoveItem.bind(this);
      this.scope = scope;
      this.query = new SearchQuery(this);
      this.items = [];
      this.filters = [];
      this.action.searchView = this;
    }

    createMenu(scope, el, parent) {
      const menu = new SearchMenu(el, parent, {select: this.onSelectItem});
      menu.searchView = this;
      return menu;
    }

    template() {
      return Katrid.$templateCache.get('view.search');
    }

    inputKeyDown(ev) {
      switch (ev.keyCode) {
        case Katrid.UI.Keyboard.keyCode.DOWN:
          this.move(1);
          ev.preventDefault();
          break;
        case Katrid.UI.Keyboard.keyCode.UP:
          this.move(-1);
          ev.preventDefault();
          break;
        case Katrid.UI.Keyboard.keyCode.ENTER:
          this.selectItem(ev, this.element.find('.search-view-menu > li.active'));
          break;
      }
    }

    move(distance) {
      const fw = distance > 0;
      distance = Math.abs(distance);
      while (distance !== 0) {
        distance--;
        let el = this.element.find('.search-view-menu > li.active');
        if (el.length) {
          el.removeClass('active');
          if (fw) {
            el = el.next();
          } else {
            el = el.prev();
          }
          el.addClass('active');
        } else {
          if (fw) {
            el = this.element.find('.search-view-menu > li').first();
          } else {
            el = this.element.find('.search-view-menu > li').last();
          }
          el.addClass('active');
        }
      }
    }

    selectItem(ev, el) {
      el.data('searchItem').select(ev);
    }

    link(scope, el, attrs, controller, $compile) {
      let html = el;
      html.addClass(attrs.class);

      this.$compile = $compile;
      this.view = scope.views.search;
      this.viewContent = $(this.view.content);
      this.element = html;
      this.toolbar = this.element.closest('.data-heading').find('.toolbar').first();
      this.searchView = html.find('.search-view');
      this.searchView.find('.search-view-input').keydown(this.inputKeyDown);

      let btnViewMore = html.find('.search-view-more');
      btnViewMore.click(evt => {
        Katrid.localSettings.searchMenuVisible = !Katrid.localSettings.searchMenuVisible;
        this.scope.$apply(() => this.scope.search.viewMoreButtons = Katrid.localSettings.searchMenuVisible);
      });
      this.menu = this.createMenu(scope, html.find('.search-dropdown-menu.search-view-menu'), html);
      this.menu.searchView = this;
      this.menu.link();

      // input key control events
      this.menu.input.on('keydown', function(evt) {});

      this.scope.search.viewMoreButtons = Katrid.localSettings.searchMenuVisible;

      // wait for view loaded
      for (let item of Array.from(this.viewContent.children()))
        this.loadItem($(item));

    }

    loadItem(item, value, parent, cls) {
      console.log('load item', item, value);
      const tag = item.prop('tagName');
      if (cls == null) {
        if (tag === 'FIELD') {
          cls = SearchField;
        } else if (tag === 'FILTER') {
          cls = SearchFilter;
        } else if (tag === 'GROUP') {
          for (let grouping of Array.from(item.children())) {
            this.loadItem($(grouping), null, null, SearchGroup);
          }
          return;
        }
      }

      const name = item.attr('name');
      item = new cls(name, item, this.menu.element, this.view.fields[name], this.menu);
      item.id = this.items.length;
      item.searchView = this;
      if (value) {
        item.expandable = false;
        item.value = value;
      }
      item.link(this.scope, this.$compile, parent);

      this.items.push(item);
    }

    dump() {
      return this.query.items;
    }

    load(items) {
      for (let i of items)
        (new FacetView(this.items[i.id], i.facet.values)).load(this);
    }

    renderFacets() {
      for (let item of this.query.items)
        if (!item.facet)
          (new FacetView(item)).render(this);
    }

    first() {
      this.element.find('.search-view-menu > li.active').removeClass('active');
      return this.element.find('.search-view-menu > li').first().addClass('active');
    }

    onSelectItem(evt, obj) {
      return this.query.add(obj);
    }

    onRemoveItem(evt, obj) {
      return this.query.remove(obj);
    }

    removeItem(obj) {
      this.query.remove(obj);
    }

    change() {
      if (this.query.groups.length || (this.scope.dataSource.groups && this.scope.dataSource.groups.length)) {
        this.scope.action.applyGroups(this.query.groups);
      }
      if (this.query.groups.length === 0) {
        return this.scope.action.setSearchParams(this.query.getParams());
      }
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
      const r = {};
      if (_.isArray(value)) {
        r[name] = value[0];
      } else {
        r[name + '__icontains'] = value;
      }
      return r;
    }

    _doChange() {
      this.view.update();
    }
  }

  class SearchFilter extends SearchItem {
    constructor(view, name, label, domain, group, el) {
      super(view, name, el);
      this.group = group;
      this.label = label;
      if (_.isString(domain))
        domain = JSON.parse(domain.replace(/'/g, '"'));
      this.domain = domain;
      this._selected = false;
    }

    static fromItem(view, el, group) {
      return new SearchFilter(view, el.attr('name'), el.attr('label'), el.attr('domain'), group, el);
    }

    toString() {
      return this.label;
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
      return this.label;
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

  class SearchFilterGroup extends Array {
    constructor(view) {
      super();
      this.view = view;
      this._selection = [];
      this._facet = new FacetView(this);
    }

    static fromItem(view, el) {
      let group = new SearchFilterGroup(view);
      group.push(SearchFilter.fromItem(view, el, group));
      return group;
    }

    static fromGroup(view, el) {
      let group = new SearchFilterGroup(view);
      for (let child of el.children())
        group.push(SearchFilter.fromItem(view, $(child), group));
      return group;
    }

    addValue(item) {
      this._selection.push(item);
      // this._facet.addValue(item);
      this._facet.values = this._selection.map(item => ({ searchString: item.getDisplayValue(), value: item.value }));
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

    getFacetLabel() {
      return '<span class="fa fa-filter"></span>';
    }

    _refresh() {
      if (this._selection.length) {
        if (this.view.facets.indexOf(this._facet) === -1)
          this.view.facets.push(this._facet);
      } else if (this.view.facets.indexOf(this._facet) > -1)
        this.view.facets.splice(this.view.facets.indexOf(this._facet), 1);
      console.log(this.view.facets);
    }

    getParamValue(name, v) {
      return v.value;
    }

    clear() {
      this._selection = [];
    }

  }

  class CustomFilterItem extends SearchFilter {
    constructor(view, field, condition, value, group) {
      super(view, field.name, field.caption, null, group);
      console.log('group', group);
      this.field = field;
      this.condition = condition;
      this._value = value;
      this._selected = true;
    }

    toString() {
      let s = this.field.format(this._value);

      return this.field.caption + ' ' + conditionsLabels[this.condition].toLowerCase() + ' "' + s + '"';
    }

    getParamValue() {
      console.log('search param', this.searchValue);
    }

    get value() {
      let r = {};
      r[this.field.name + conditionSuffix[this.condition]] = this._value;
      return r;
    }

  }

  Katrid.uiKatrid.controller('CustomFilterController', function ($scope, $element, $filter) {
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
      $scope.searchValue = value;
    };

    $scope.addCondition = (field, condition, value) => {
      if (!$scope.tempFilter)
        $scope.tempFilter = new SearchFilterGroup($scope.$parent.search);
      $scope.tempFilter.push(new CustomFilterItem($scope.$parent.search, field, condition, value, $scope.tempFilter));
      $scope.field = null;
      $scope.condition = null;
      $scope.controlVisible = false;
      $scope.searchValue = undefined;
    };

    $scope.applyFilter = () => {
      if ($scope.searchValue)
        $scope.addCondition($scope.field, $scope.condition, $scope.searchValue);
      $scope.customFilter.push($scope.tempFilter);
      $scope.tempFilter.selectAll();
      $scope.tempFilter = null;
      $scope.customSearchExpanded = false;
    };
  })

  .directive('customFilter', () => (
    {
      restrict: 'A',
      scope: {
        action: '=',
      },
    }
  ));

  class SearchView {
    constructor(scope, view) {
      this.scope = scope;
      this.query = new SearchQuery(this);
      this.viewMoreButtons = false;
      this.items = [];
      this.filterGroups = [];
      this.groups = [];
      this.facets = [];

      this.view = view;
      this.el = $(view.content);

      let menu = this.createMenu(scope, el.find('.search-dropdown-menu.search-view-menu'), el);
      console.log('menu', menu);

      for (let child of this.el.children()) {
        child = $(child);
        let tag = child.prop('tagName');
        let obj;
        if (tag === 'FILTER') {
          obj = SearchFilterGroup.fromItem(this, child);
          this.filterGroups.push(obj);
        }
        else if (tag === 'FILTER-GROUP') {
          obj = SearchFilterGroup.fromGroup(this, child);
          this.filterGroups.push(obj);
        }
        this.append(obj);
      }
    }

    createMenu(scope, el, parent) {
      const menu = new SearchMenu(el, parent, {select: this.onSelectItem});
      menu.searchView = this;
      return menu;
    }

    append(item) {
      this.items.push(item);
    }

    remove(index) {
      let facet = this.facets[index];
      facet.destroy();
      this.facets.splice(index, 1);
    }

    getParams() {
      let r = [];
      for (let i of this.facets)
        r = r.concat(i.getParamValues());
      return r;
    }

    update() {
      this.scope.action.setSearchParams(this.getParams());
    }
  }

  class SearchViewComponent extends Katrid.UI.Widgets.Component {
    constructor($compile) {
      super();
      this.retrict = 'E';
      this.templateUrl = 'view.search';
      this.replace = true;
      this.scope = false;

      this.$compile = $compile;
    }

    link(scope, el, attrs, controller) {
      console.log('link scope controller');
      let view = scope.action.views.search;
      let elView = $(view.content);
      scope.search = new SearchView(scope, view);
      // (new SearchView(scope, {})).link(scope.action, el, attrs, controller, this.$compile);
    }
  }

  Katrid.uiKatrid.controller('SearchMenuController', function($scope) {

  });

  Katrid.uiKatrid.directive('searchView', SearchViewComponent);

  Katrid.UI.Views.SearchView = SearchView;
  Katrid.UI.Views.SearchViewComponent = SearchViewComponent;
  Katrid.UI.Views.SearchMenu = SearchMenu;

})();

(function () {

  class Recognition {
    constructor() {
      this.active = false;
    }

    init() {
      let rec = window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition || window.oSpeechRecognition;
      rec = (this.recognition = new rec());
      rec.continuous = true;
      rec.onresult = this.onResult;
      rec.onstart = () => this.active = true;
      rec.onend = () => this.active = false;
    }

    pause() {
      return this.recognition.pause();
    }

    resume() {
      return this.recognition.resume();
    }

    start() {
      if ((this.recognition == null)) {
        this.init();
      }
      return this.recognition.start();
    }

    stop() {
      return this.recognition.stop();
    }

    toggle() {
      if (this.active) {
        return this.stop();
      } else {
        return this.start();
      }
    }

    onResult(event) {
      return console.log(event);
    }
  }


  class VoiceCommand extends Recognition {
    constructor() {
      super();
      this.onResult = this.onResult.bind(this);
      this.commands = [];
    }

    onResult(event) {
      // Do command here
      const res = event.results[event.results.length-1];
      let cmd = res[0].transcript;
      if (cmd) {
        cmd = cmd.trim();
        for (let obj of this.commands) {
          if (obj.name.toLocaleLowerCase() === cmd.toLocaleLowerCase()) {
            if (obj.command)
              eval(obj.command);
            else if (obj.href)
              window.location.href = obj.href;
            break;
          }
        }
      }
    }

    addCommands(cmds) {
      return this.commands = this.commands.concat(cmds);
    }
  }


  Katrid.Speech = {
    Recognition,
    VoiceCommand
  };

  // Auto initialize voice command
  Katrid.Speech.voiceCommand = new VoiceCommand();

  if (Katrid.Settings.Speech.enabled) {
    // load voice commands
    let model = new Katrid.Services.Model('voice.command');
    model.search()
    .done(res => {
      if (res.ok)
        for (let cmd of res.result.data)
          Katrid.Speech.voiceCommand.commands.push({ name: cmd.name, command: cmd.command });
    });

    Katrid.Speech.voiceCommand.start();
  }

}).call(this);
(function() {

  let uiKatrid = Katrid.uiKatrid;

  uiKatrid.controller('TabsetController', [
    '$scope',
    function ($scope) {
      const ctrl = this;
      const tabs = (ctrl.tabs = ($scope.tabs = []));

      ctrl.select = function (selectedTab) {
        angular.forEach(tabs, function (tab) {
          if (tab.active && (tab !== selectedTab)) {
            tab.active = false;
            tab.onDeselect();
          }
        });
        selectedTab.active = true;
        selectedTab.onSelect();
      };

      ctrl.addTab = function (tab) {
        tabs.push(tab);
        // we can't run the select function on the first tab
        // since that would select it twice
        if (tabs.length === 1) {
          tab.active = true;
        } else if (tab.active) {
          ctrl.select(tab);
        }
      };

      ctrl.removeTab = function (tab) {
        const index = tabs.indexOf(tab);
        //Select a new tab if the tab to be removed is selected and not destroyed
        if (tab.active && (tabs.length > 1) && !destroyed) {
          //If this is the last tab, select the previous tab. else, the next tab.
          const newActiveIndex = index === (tabs.length - 1) ? index - 1 : index + 1;
          ctrl.select(tabs[newActiveIndex]);
        }
        tabs.splice(index, 1);
      };

      var destroyed = undefined;
      $scope.$on('$destroy', function () {
        destroyed = true;
      });
    }
  ]);

  uiKatrid.directive('tabset', () =>
    ({
      restrict: 'EA',
      transclude: true,
      replace: true,
      scope: {
        type: '@'
      },
      controller: 'TabsetController',
      template: `<div class="tabset"><div class=\"clearfix\"></div>\n` +
      "  <div class=\"nav nav-{{type || 'tabs'}}\" ng-class=\"{'nav-stacked': vertical, 'nav-justified': justified}\" ng-transclude></div>\n" +
      "  <div class=\"tab-content\">\n" +
      "    <div class=\"tab-pane\" \n" +
      "         ng-repeat=\"tab in tabs\" \n" +
      `         ng-class="{active: tab.active}">` +
      `<div class="col-12"><div class="row" tab-content-transclude="tab"></div></div>` +
      "    </div>\n" +
      "  </div>\n" +
      "</div>\n",
      link(scope, element, attrs) {
        scope.vertical = angular.isDefined(attrs.vertical) ? scope.$parent.$eval(attrs.vertical) : false;
        return scope.justified = angular.isDefined(attrs.justified) ? scope.$parent.$eval(attrs.justified) : false;
      }
    })
  );


  uiKatrid.directive('tab', [
    '$parse',
    $parse =>
      ({
        require: '^tabset',
        restrict: 'EA',
        replace: true,
        template: `<a class="nav-item nav-link" href ng-click="select()" tab-heading-transclude ng-class="{active: active, disabled: disabled}">{{heading}}</a>`,
        transclude: true,
        scope: {
          active: '=?',
          heading: '@',
          onSelect: '&select',
          onDeselect: '&deselect'
        },
        controller() {
          //Empty controller so other directives can require being 'under' a tab
        },
        compile(elm, attrs, transclude) {
          return function (scope, elm, attrs, tabsetCtrl) {
            scope.$watch('active', function (active) {
              if (active) {
                tabsetCtrl.select(scope);
              }
            });
            scope.disabled = false;
            if (attrs.disabled) {
              scope.$parent.$watch($parse(attrs.disabled), function (value) {
                scope.disabled = !!value;
              });
            }

            scope.select = function () {
              if (!scope.disabled) {
                scope.active = true;
              }
            };

            tabsetCtrl.addTab(scope);
            scope.$on('$destroy', function () {
              tabsetCtrl.removeTab(scope);
            });
            //We need to transclude later, once the content container is ready.
            //when this link happens, we're inside a tab heading.
            scope.$transcludeFn = transclude;
          };
        }

      })

  ]);

  uiKatrid.directive('tabHeadingTransclude', [() =>
    ({
      restrict: 'A',
      require: '^tab',
      link(scope, elm, attrs, tabCtrl) {
        scope.$watch('headingElement', function (heading) {
          if (heading) {
            elm.html('');
            elm.append(heading);
          }
        });
      }
    })

  ]);


  uiKatrid.directive('tabContentTransclude', function () {

    const isTabHeading = node => node.tagName && (node.hasAttribute('tab-heading') || node.hasAttribute('data-tab-heading') || (node.tagName.toLowerCase() === 'tab-heading') || (node.tagName.toLowerCase() === 'data-tab-heading'));

    return {
      restrict: 'A',
      require: '^tabset',
      link(scope, elm, attrs) {
        const tab = scope.$eval(attrs.tabContentTransclude);
        //Now our tab is ready to be transcluded: both the tab heading area
        //and the tab content area are loaded.  Transclude 'em both.
        tab.$transcludeFn(tab.$parent, function (contents) {
          angular.forEach(contents, function (node) {
            if (isTabHeading(node)) {
              //Let tabHeadingTransclude know.
              tab.headingElement = node;
            } else {
              elm.append(node);
            }
          });
        });
      }

    };
  });

}).call(this);

(function () {
  class BaseTemplate {
    getBreadcrumb(scope, viewType) {
      let html = `<ol class="breadcrumb">`;
      let i = 0;
      for (let h of Katrid.Actions.Action.history) {
        if (i === 0 && h.viewModes.length > 1) html += `<li><a href="javascript:void(0)" ng-click="action.backTo(0, 'list')">${ h.info.display_name }</a></li>`;
        i++;
        if (Katrid.Actions.Action.history.length > i && h.viewType === 'form')
          html += `<li><a href="javascript:void(0)" ng-click="action.backTo(${i-1})">${ h.scope.record.display_name }</a></li>`;
      }
      if (scope.action.viewType === 'form')
          html += "<li>{{ record.display_name }}</li>";
      html += '</ol>';
      return html;
    }

    getSettingsDropdown(viewType) {
      if (viewType === 'form') {
        return `<ul class="dropdown-menu pull-right">
    <li>
      <a href="javascript:void(0);" ng-click="action.showDefaultValueDialog()">${ Katrid.i18n.gettext('Set Default') }</a>
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
          <button type="button" class="close" data-dismiss="modal" aria-label="${ Katrid.i18n.gettext('Close') }"><span aria-hidden="true">&times;</span></button>
          <h4 class="modal-title">${ Katrid.i18n.gettext('Set Default') }</h4>
        </div>
        <div class="modal-body">
          <select class="form-control" id="id-set-default-value">
            <option ng-repeat="field in view.fields">{{ field.caption }} = {{ record[field.name] }}</option>
          </select>
          <div class="radio">
            <label><input type="radio" name="public">${ Katrid.i18n.gettext('Only me') }</label>
          </div>
          <div class="radio">
            <label><input type="radio" name="public">${ Katrid.i18n.gettext('All users') }</label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary">${ Katrid.i18n.gettext('Save') }</button>
          <button type="button" class="btn btn-default" data-dismiss="modal">${ Katrid.i18n.gettext('Cancel') }</button>
        </div>
      </div>
    </div>
  </div>\
  `;
    }

    getViewRenderer(viewType) {
      return this[`render_${viewType}`];
    }

    getViewModesButtons(scope) {
      const act = scope.action;
      const buttons = {
        card: '<button class="btn btn-default" type="button" ng-click="action.setViewType(\'card\')"><i class="fa fa-th-large"></i></button>',
        list: '<button class="btn btn-default" type="button" ng-click="action.setViewType(\'list\')"><i class="fa fa-list"></i></button>',
        form: '<button class="btn btn-default" type="button" ng-click="action.setViewType(\'form\')"><i class="fa fa-edit"></i></button>',
        calendar: '<button class="btn btn-default" type="button" ng-click="action.setViewType(\'calendar\')"><i class="fa fa-calendar"></i></button>',
        chart: '<button class="btn btn-default" type="button" ng-click="action.setViewType(\'chart\')"><i class="fa fa-bar-chart-o"></i></button>'
      };
      return buttons;
    }

    // buttons group include
    getViewButtons(scope) {
      const act = scope.action;
      const buttons = this.getViewModesButtons(scope);
      const r = [];
      for (let vt of Array.from(act.viewModes)) {
        r.push(buttons[vt]);
      }
      return `<div class="btn-group">${r.join('')}</div>`;
    }

    getFilterButtons() {
      return `\
  <div class="btn-group search-view-more-area" ng-show="search.viewMoreButtons">
    <div class="btn-group">
      <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" type="button" aria-expanded="false"><span class="fa fa-filter"></span> ${Katrid.i18n.gettext('Filters')} <span class="caret"></span></button>
      <ul class="dropdown-menu search-view-filter-menu">
      </ul>
    </div>
    <div class="btn-group">
      <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" type="button"><span class="fa fa-bars"></span> ${Katrid.i18n.gettext('Group By')} <span class="caret"></span></button>
      <ul class="dropdown-menu search-view-groups-menu">
      </ul>
    </div>
    <button class="btn btn-default"><span class="fa fa-star"></span> ${Katrid.i18n.gettext('Favorites')} <span class="caret"></span></button>
  </div>\
  `;
    }

    preRender_card(scope, html) {
      const buttons = this.getViewButtons(scope);
      html = $(html);
      let el = html;
      html.children('field').remove();
      for (let field of Array.from(html.find('field'))) {
        field = $(field);
        const name = $(field).attr('name');
        field.replaceWith(`{{ ::record.${name} }}`);
      }
      html = html.html();
      return `<div class="data-form">
  <header class="data-heading panel panel-default">
      <div class=\"panel-body\">
        <div class='row'>
          <div class="col-sm-6">
          <ol class="breadcrumb">
            <li>{{ action.info.display_name }}</li>
          </ol>
          </div>
          <search-view class="col-md-6"/>
          <!--<p class=\"help-block\">{{ action.info.usage }}&nbsp;</p>-->
        </div>
        <div class="row">
        <div class="toolbar">
  <div class="col-sm-6">
          <button class=\"btn btn-primary\" type=\"button\" ng-click=\"action.createNew()\">${Katrid.i18n.gettext('Create')}</button>
          <span ng-show="dataSource.loading" class="badge page-badge-ref">{{dataSource.pageIndex}}</span>
    <div class=\"btn-group\">
      <button type=\"button\" class=\"btn btn-default dropdown-toggle\" data-toggle=\"dropdown\" aria-haspopup=\"true\">
        ${Katrid.i18n.gettext('Action')} <span class=\"caret\"></span></button>
      <ul class=\"dropdown-menu">
        <li><a href='javascript:void(0)' ng-click=\"action.deleteSelection()\"><i class="fa fa-fw fa-trash-o"></i> ${Katrid.i18n.gettext('Delete')}</a></li>
      </ul>
    </div>
  
    <!--button class="btn btn-default" ng-click="dataSource.refresh()"><i class="fa fa-refresh"></i> ${ Katrid.i18n.gettext('Refresh') }</button-->
  
  </div>
  <div class="col-sm-6">
  ${this.getFilterButtons()}
    <div class=\"pull-right\">
              <div class="btn-group pagination-area">
                <span class="paginator">{{dataSource.offset|number}} - {{dataSource.offsetLimit|number}}</span> / <span class="total-pages">{{ dataSource.recordCount|number }}</span>
              </div>
      <div class=\"btn-group\">
        <button class=\"btn btn-default\" type=\"button\" ng-click=\"dataSource.prevPage()\"><i class=\"fa fa-chevron-left\"></i>
        </button>
        <button class=\"btn btn-default\" type=\"button\" ng-click=\"dataSource.nextPage()\"><i class=\"fa fa-chevron-right\"></i>
        </button>
      </div>\n
      ${buttons}
  </div>
  </div>
  </div>
  </div>
      </header>
  </div>
  <div class="content-scroll">
  <div class="content">
  ${this.getCardView(scope, html, el)}
  </div>
  </div>
  </div>
  `;
    }

    getCardView(scope, html, el) {
      scope.defaultGrouping = $(el).data('grouping');
      scope.dataSource.autoLoadGrouping = true;

      if (_.isUndefined(scope.kanbanAddGroupItem)) {
        scope.kanbanHideAddGroupItemDlg = (event) => {
          event.target.closest('#kanban-add-group-item-dlg').remove();
        };

        scope.kanbanShowAddGroupDlg = (event) => {
          angular.element(event.target).scope().kanbanAddGroupDlg = true;
          setTimeout(() => {
            $(event.target).closest('.kanban-add-group').find('input').focus();
          }, 10)
        };

        scope.kanbanAddGroup = (event, name) => {
          let gname = $(event.target).closest('.kanban-add-group').data('group-name');
          let field = scope.view.fields[gname];
          let svc = new Katrid.Services.Model(field.model);
          console.log('the name is', name);
          svc.createName(name)
          .done((res) => {
            console.log(res);
          });
        };

        scope.kanbanAddItem = (event, name) => {
          if (name) {
            let ctx = {};
            let g = $(event.target).closest('.kanban-group');
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
                })
              }
            });
          }
          scope.kanbanHideAddGroupItemDlg(event);
        };
        scope.kanbanShowAddGroupItemDlg = (event) => {
          const templ = `
          <form id="kanban-add-group-item-dlg" ng-submit="kanbanAddItem($event, kanbanNewName)">
            <div class="form-group">
              <input ng-model="kanbanNewName" ng-init="kanbanNewName = ''" class="form-control" ng-esc="kanbanHideAddGroupItemDlg($event)" placeholder="${Katrid.i18n.gettext('Add')}" ng-blur="kanbanHideAddGroupItemDlg($event)">
            </div>
            <button type="submit" class="btn btn-primary" onmousedown="event.preventDefault();event.stopPropagation();">${Katrid.i18n.gettext('Add')}</button>
            <button class="btn btn-default">${Katrid.i18n.gettext('Cancel')}</button>
          </form>
          `;
          let s = angular.element(event.target).scope();
          let el = Katrid.core.compile(templ)(s);
          el = $(event.target).closest('.kanban-header').append(el);
          el.find('input').focus();
        };
      }

      const itemAttrs = `<div class="btn-group pull-right">
        <button type="button" class="btn dropdown-toggle" data-toggle="dropdown">
          <span class="caret"></span>
        </button>
        <ul class="dropdown-menu">
          <li>
            <a href="#">Move to next level</a>
          </li>
          <li>
            <a href="#">Action 2</a>
          </li>
          <li>
            <a href="#">Action 3</a>
          </li>
        </ul>
      </div>`;

      let s = '<div class="card-view kanban" ng-if="groupings.length" kanban-draggable=".kanban-group" kanban-group>';
      s += `
<div ng-repeat="group in groupings" class="kanban-group sortable-item" data-id="{{group._paramValue}}" data-group-name="{{group._paramName}}">
  <div class="kanban-header margin-bottom-8">
    <div class="pull-right">
      <button class="btn" ng-click="kanbanShowAddGroupItemDlg($event)"><i class="fa fa-plus"></i></button>
    </div>
    <h4 ng-bind="group.__str__"></h4>
    <div class="clearfix"></div>
  </div>
  <div class="kanban-items" kanban-draggable=".kanban-items" kanban-item>
    <div ng-repeat="record in group.records" class="kanban-item sortable-item ui-sortable-handle" ng-click="action.listRowClick($index, record, $event)">
      ${html}
    </div>
  </div>
</div>
<div class="kanban-add-group" title="${Katrid.i18n.gettext('Click here to add new column')}" ng-click="kanbanNewName='';kanbanShowAddGroupDlg($event);" data-group-name="{{groupings[0]._paramName}}">
<div ng-hide="kanbanAddGroupDlg">
  <i class="fa fa-fw fa-chevron-right fa-2x"></i>
  <div class="clearfix"></div>
  <span class="title">${Katrid.i18n.gettext('Add New Column')}</span>
</div>
<form ng-show="kanbanAddGroupDlg" ng-submit="kanbanAddGroup($event, kanbanNewName)">
<div class="form-group">
  <input class="form-control" ng-blur="kanbanAddGroupDlg=false" ng-esc="kanbanAddGroupDlg=false" placeholder="${Katrid.i18n.gettext('Add')}" ng-model="kanbanNewName">
</div>
  <button type="submit" class="btn btn-primary">${Katrid.i18n.gettext('Add')}</button>
  <button type="button" class="btn btn-default">${Katrid.i18n.gettext('Cancel')}</button>
</form>
</div>

</div><div class="card-view kanban" ng-if="!groupings.length">`;
      s += `<div ng-repeat="record in records" class="panel panel-default card-item card-link" ng-click="action.listRowClick($index, record, $event)">
        ${html}
      </div>`;
      s += `\      <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            <div class="card-item card-ghost"></div>
            </div>
            \
      `;
      return s;
    }

    preRender_toolbar(scope, viewType) {
      const buttons = this.getViewButtons(scope);
      let actions = '';
      if (scope.view.view_actions) {
        for (let act of Array.from(scope.view.view_actions)) {
          var confirmation;
          if (act.confirm) {
            confirmation = `, '${act.confirm}'`;
          } else {
            confirmation = ', null';
          }
          if (act.prompt) {
            confirmation += `, '${act.prompt}'`;
          }
          actions += `<li><a href="javascript:void(0)" ng-click="action.doViewAction('${act.name}', record.id${confirmation})">${act.title}</a></li>`;
        }
      }
      return `\
  <div class="data-heading panel panel-default">
      <div class="panel-body">
        <div>
          <a href="javascript:void(0)" title="Add to favorite"><i class="fa star fa-star-o pull-right"></i></a>
          ${ this.getBreadcrumb(scope) }
          <p class="help-block">{{ ::action.info.usage }}</p>
        </div>
        <div class="toolbar">
    <button class="btn btn-primary" type="button" ng-disabled="dataSource.uploading" ng-click="dataSource.saveChanges()" ng-show="dataSource.changing">${Katrid.i18n.gettext('Save')}</button>
    <button class="btn btn-primary" type="button" ng-disabled="dataSource.uploading" ng-click="dataSource.editRecord()" ng-show="!dataSource.changing">${Katrid.i18n.gettext('Edit')}</button>
    <button class="btn btn-default" type="button" ng-disabled="dataSource.uploading" ng-click="dataSource.newRecord()" ng-show="!dataSource.changing">${Katrid.i18n.gettext('Create')}</button>
    <button class="btn btn-default" type="button" ng-click="dataSource.cancelChanges()" ng-show="dataSource.changing">${Katrid.i18n.gettext('Cancel')}</button>
    <div class="btn-group">    
      <div class="btn-group">
        <button id="attachments-button" attachments-button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">
          <span ng-show="!$parent.attachments.length">${ Katrid.i18n.gettext('Attachments') }</span>
          <span ng-show="$parent.attachments.length">{{ sprintf(gettext('%d Attachment(s)'), $parent.attachments.length) }}</span>
          <span class="caret"></span>
        </button>
        <ul class="dropdown-menu attachments-menu">
          <li ng-repeat="attachment in $parent.attachments">
            <a href="{{ ::attachment.download_url }}">{{ ::attachment.name }} <span class="fa fa-trash-o pull-right" title="Delete this attachment" onclick="event.preventDefault();" ng-click="action.deleteAttachment($index);"></span></a>
          </li>
          <li role="separator" class="divider" ng-show="attachments.length"></li>
          <li>
            <a href="javascript:void(0)" onclick="$(this).next().click()">${Katrid.i18n.gettext('Add...')}</a>
            <input type="file" class="input-file-hidden" multiple onchange="Katrid.Services.Attachments.upload(this)">
          </li>
        </ul>
      </div>
      <div class="btn-group">
        <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">
          ${Katrid.i18n.gettext('Action')} <span class="caret"></span></button>
        <ul class="dropdown-menu dropdown-menu-actions">
          <li><a href='javascript:void(0)' ng-click="action.deleteSelection(true)"><i class="fa fa-fw fa-trash-o"></i> ${Katrid.i18n.gettext('Delete')}</a></li>
          <li><a href='javascript:void(0)' ng-click="action.copy()"><i class=\"fa fa-fw fa-files-o\"></i> ${Katrid.i18n.gettext('Duplicate')}</a></li>
          ${actions}
        </ul>
      </div>
    </div>
    <div class="pull-right">
      <div class="btn-group pagination-area">
          <span ng-show="records.length">
            {{ dataSource.recordIndex }} / {{ records.length }}
          </span>
      </div>
      <div class="btn-group" role="group">
        <button class="btn btn-default" type="button" ng-click="dataSource.prior('form')"><i class="fa fa-chevron-left"></i>
        </button>
        <button class="btn btn-default" type="button" ng-click="dataSource.next('form')"><i class="fa fa-chevron-right"></i>
        </button>
      </div>\n
      ${buttons}
  </div>
  </div>
      </div>
    </div>\
  `;
    }

    preRender_form(scope, html, toolbar) {
      if (toolbar == null) { toolbar = true; }
      if (toolbar) {
        toolbar = this.preRender_toolbar(scope, 'form');
      } else {
        toolbar = '';
      }

      return `\
  <div ng-form="form" class="data-form" ng-class="{'form-data-changing': dataSource.changing, 'form-data-readonly': !dataSource.changing}">
  ${ toolbar }
  <div class="content-scroll"><div class="content">
    <div class="clearfix"></div><header class="content-container-heading"></header><div class="clearfix"></div>  
  <div class="content container">
  <div class="panel panel-default data-panel browsing" ng-class="{ browsing: dataSource.browsing, editing: dataSource.changing }">
  <div class="panel-body"><div class="row">${html}</div></div></div></div></div></div></div>`;
    }

    preRender_list(scope, html) {
      const reports = `\
  <div class="btn-group">
    <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">
      ${Katrid.i18n.gettext('Print')} <span class="caret"></span></button>
    <ul class=\"dropdown-menu">
      <li><a href='javascript:void(0)' ng-click="action.autoReport()"><i class="fa fa-fw fa-file"></i> ${Katrid.i18n.gettext('Auto Report')}</a></li>
    </ul>
  </div>\
  `;
      const buttons = this.getViewButtons(scope);
      let ret = `<div class="data-heading panel panel-default">
    <div class="panel-body">
      <div class='row'>
        <div class="col-sm-6">
          <ol class="breadcrumb">
            <li>{{ action.info.display_name }}</li>
          </ol>
        </div>
        <search-view class="col-md-6"/>
        <!--<p class=\"help-block\">{{ action.info.usage }}&nbsp;</p>-->
      </div>
      <div class="row">
      <div class="toolbar">
  <div class="col-sm-6">
        <button class=\"btn btn-primary\" type=\"button\" ng-click=\"action.createNew()\">${Katrid.i18n.gettext('Create')}</button>
        <span ng-show="dataSource.loading" class="badge page-badge-ref">{{dataSource.pageIndex}}</span>
  
  ${reports}
  <div class="btn-group" ng-show="action.selectionLength">
    <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true">
      ${Katrid.i18n.gettext('Action')} <span class=\"caret\"></span></button>
    <ul class="dropdown-menu">
      <li><a href='javascript:void(0)' ng-click=\"action.deleteSelection()\"><i class="fa fa-fw fa-trash-o"></i> ${Katrid.i18n.gettext('Delete')}</a></li>
    </ul>
  </div>
  
  <!--button class="btn btn-default" ng-click="dataSource.refresh()"><i class="fa fa-refresh"></i> ${ Katrid.i18n.gettext('Refresh') }</button-->
  
  </div>
  <div class="col-sm-6">
  ${this.getFilterButtons()}
  
  <div class=\"pull-right\">
            <div class="btn-group pagination-area">
              <span class="paginator">{{dataSource.offset|number}} - {{dataSource.offsetLimit|number}}</span> / <span class="total-pages">{{dataSource.recordCount|number}}</span>
            </div>
    <div class=\"btn-group\">
      <button class=\"btn btn-default\" type=\"button\" ng-click=\"dataSource.prevPage()\"><i class=\"fa fa-chevron-left\"></i>
      </button>
      <button class=\"btn btn-default\" type=\"button\" ng-click=\"dataSource.nextPage()\"><i class=\"fa fa-chevron-right\"></i>
      </button>
    </div>\n
    ${buttons}
  </div>
  </div>
  </div>
  </div>
    </div>
  </div>
  <div class="content-scroll">
  <div class="content no-padding">
  <div class="panel-default data-panel">
  <div class=\"panel-body no-padding\">
  <div class=\"dataTables_wrapper form-inline dt-bootstrap no-footer\">${html}</div></div></div></div></div>`;
      return ret;
    }

    static get cssListClass() {
      return 'table table-striped table-bordered table-condensed table-hover display responsive nowrap dataTable no-footer dtr-column';
    }

    renderList(scope, element, attrs, rowClick, parentDataSource, showSelector=true) {
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
        } else totals.push(total);

        name = col.attr('name');
        const fieldInfo = scope.view.fields[name];

        if ((col.attr('visible') === 'False') || (fieldInfo.visible === false))
          continue;

        // if (fieldInfo.choices) {
        //   fieldInfo._listChoices = {};
        //   for (let choice of Array.from(fieldInfo.choices)) {
        //     fieldInfo._listChoices[choice[0]] = choice[1];
        //   }
        // }

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
        tfoot = `<tfoot><tr>${ totals.map(t => (t ? `<td class="text-right"><strong><ng-total field="${ t[0] }" type="${ t[1] }"></ng-total></ strong></td>` : '<td class="borderless"></td>')).join('') }</tr></tfoot>`;
      else
        tfoot = '';
      let gridClass = ' grid';
      if (scope.inline)
        gridClass += ' inline-editor';
      return `<table class="${this.constructor.cssListClass}${gridClass}">
  <thead><tr>${ths}</tr></thead>
  <tbody>
  <tr ng-repeat="record in records" ng-click="${rowClick}" ng-class="{'group-header': record._hasGroup, 'form-data-changing': (dataSource.changing && dataSource.recordIndex === $index), 'form-data-readonly': !(dataSource.changing && dataSource.recordIndex === $index)}" ng-form="grid-row-form-{{$index}}" id="grid-row-form-{{$index}}">${cols}</tr>
  </tbody>
  ${ tfoot }
  </table>
  `;
    }

    renderGrid(scope, element, attrs, rowClick) {
      const tbl = this.renderList(scope, element, attrs, rowClick, true, false);
      let buttons;
      if (attrs.inline == 'inline')
        buttons = `<button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="parent.dataSource.changing && !dataSource.changing" type="button">${Katrid.i18n.gettext('Add')}</button><button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="dataSource.changing" type="button">${Katrid.i18n.gettext('Save')}</button><button class="btn btn-xs btn-info" ng-click="cancelChanges()" ng-show="dataSource.changing" type="button">${Katrid.i18n.gettext('Cancel')}</button>`;
      else
        buttons = `<button class="btn btn-xs btn-info" ng-click="addItem()" ng-show="parent.dataSource.changing" type="button">${Katrid.i18n.gettext('Add')}</button>`;
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
        <button class="btn btn-primary" type="button" ng-click="report.preview()"><span class="fa fa-print fa-fw"></span> ${ Katrid.i18n.gettext('Preview') }</button>
  
        <div class="btn-group">
          <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"
                  aria-expanded="false">${ Katrid.i18n.gettext('Export')  } <span class="caret"></span></button>
          <ul class="dropdown-menu">
            <li><a ng-click="Katrid.Reports.Reports.preview()">PDF</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('docx')">Word</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('xlsx')">Excel</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('pptx')">PowerPoint</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('csv')">CSV</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('txt')">${ Katrid.i18n.gettext('Text File') }</a></li>
          </ul>
        </div>
  
        <div class="btn-group">
          <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"
                  aria-expanded="false">${ Katrid.i18n.gettext('My reports')  } <span class="caret"></span></button>
          <ul class="dropdown-menu">
            <li><a ng-click="Katrid.Reports.Reports.preview()">PDF</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('docx')">Word</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('xlsx')">Excel</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('pptx')">PowerPoint</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('csv')">CSV</a></li>
            <li><a href="javascript:void(0)" ng-click="Katrid.Reports.Reports.export('txt')">${ Katrid.i18n.gettext('Text File') }</a></li>
          </ul>
        </div>
  
      <div class="pull-right btn-group">
        <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true"
                aria-expanded="false"><i class="fa fa-gear fa-fw"></i></button>
        <ul class="dropdown-menu">
          <li><a href="javascript:void(0)" ng-click="report.saveDialog()">${ Katrid.i18n.gettext('Save') }</a></li>
          <li><a href="#">${ Katrid.i18n.gettext('Load') }</a></li>
        </ul>
      </div>
  
      </div>
    </div>
    </div>
    <div class="col-sm-12">
      <table class="col-sm-12" style="margin-top: 20px; display:none;">
        <tr>
          <td colspan="2" style="padding-top: 8px;">
            <label>${ Katrid.i18n.gettext('My reports') }</label>
  
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
    <div class="checkbox"><label><input type="checkbox" ng-model="paramsAdvancedOptions"> ${ Katrid.i18n.gettext('Advanced options') }</label></div>
    <div ng-show="paramsAdvancedOptions">
      <div class="form-group">
        <label>${ Katrid.i18n.gettext('Printable Fields') }</label>
        <input type="hidden" id="report-id-fields"/>
      </div>
      <div class="form-group">
        <label>${ Katrid.i18n.gettext('Totalizing Fields') }</label>
        <input type="hidden" id="report-id-totals"/>
      </div>
    </div>
  </div>
  
  <div id="params-sorting" class="col-sm-12 form-group">
    <label class="control-label">${ Katrid.i18n.gettext('Sorting') }</label>
    <select multiple id="report-id-sorting"></select>
  </div>
  
  <div id="params-grouping" class="col-sm-12 form-group">
    <label class="control-label">${ Katrid.i18n.gettext('Grouping') }</label>
    <select multiple id="report-id-grouping"></select>
  </div>
  
  <div class="clearfix"></div>
  
  </div>
    <hr>
      <table class="col-sm-12">
        <tr>
          <td class="col-sm-4">
            <select class="form-control" ng-model="newParam">
              <option value="">--- ${ Katrid.i18n.gettext('FILTERS') } ---</option>
              <option ng-repeat="field in report.fields" value="{{ field.name }}">{{ field.label }}</option>
            </select>
          </td>
          <td class="col-sm-8">
            <button
                class="btn btn-default" type="button"
                ng-click="report.addParam(newParam)">
              <i class="fa fa-plus fa-fw"></i> ${ Katrid.i18n.gettext('Add Parameter') }
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

    renderStatusField(fieldName) {
      return `\
  <div class="status-field status-field-sm pull-right">
    <input type="hidden" ng-model="self.${fieldName}"/>
    <div class="steps">
      <a ng-class="{active: $parent.$parent.record.${fieldName} === item[0]}" ng-repeat="item in choices">
        <span ng-bind="item[1]"/>
      </a>
    </div>
  </div>\
  `;
    }
  }


  this.Katrid.UI.Utils = {
    BaseTemplate,
    Templates: new BaseTemplate()
  };

}).call(this);
(() => {

  class Templates {
    static init(templateCache) {
      Katrid.$templateCache = templateCache;

      let oldGet = templateCache.get;

      templateCache.get = function (name) {
        return Templates.prepare(name, oldGet.call(this, name));
      };

      Templates.loadTemplates(templateCache);
    }

    static prepare(name, templ) {
      if (_.isUndefined(templ)) throw Error('Template not found: ' + name);
      if (templ.tagName === 'SCRIPT')
        return templ.innerHTML;
      return templ;
    }

    static compileTemplate(base, templ) {
      let el = $(base);
      templ = $(templ.innerHTML);
      for (let child of Array.from(templ))
        if (child.tagName === 'JQUERY') {
          child = $(child);
          let sel = child.attr('selector');
          let op = child.attr('operation');
          if (sel) sel = $(el).find(sel);
          else sel = el;
          sel[op](child[0].innerHTML);
        }
      return el[0].innerHTML;
    }

    static loadTemplates(templateCache) {
      $.get('/web/client/templates/')
      .done(res => {
        let readTemplates = (el) => {
          if (el.tagName === 'TEMPLATES') Array.from(el.childNodes).map(readTemplates);
          else if (el.tagName === 'SCRIPT') {
            let base = el.getAttribute('extends');
            let id = el.getAttribute('id') || base;
            if (base) {
              el = Templates.compileTemplate(templateCache.get(base), el);
            } else
              id = el.id;
            templateCache.put(id, el);
          }
        };
        let parser = new DOMParser();
        let doc = parser.parseFromString(res, 'text/html');
        readTemplates(doc.firstChild.childNodes[1].firstChild);
      });
    }
  }

  Katrid.UI.Templates = Templates;

})();

(() => {

  let compileButtons = (container) => {
    return container.find('button').each((idx, btn) => {
      btn = $(btn);
      if (!btn.attr('type') || (btn.attr('type') === 'object'))
        btn.attr('type', 'button');
      btn.attr('button-object', btn.attr('name'));
      btn.attr('ng-click', `action.formButtonClick(record.id, '${ btn.attr('name') }', $event.target);$event.stopPropagation();`);
      if (!btn.attr('class'))
        btn.addClass('btn btn-outline-secondary');
    });
  };

  class ToolbarComponent extends Katrid.UI.Widgets.Component {
    constructor() {
      super();
      this.scope = false;
      this.restrict = 'E';
      this.replace = true;
      this.transclude = true;
      this.templateUrl = 'view.header';
    }
  }
  Katrid.uiKatrid.directive('toolbar', ToolbarComponent);


  class ClientView {
    constructor(action) {
      this.action = action;
    }

    get template() {
      return Katrid.$templateCache.get(this.templateUrl);
    }
  }


  class BaseView {
    constructor(scope) {
      this.scope = scope;
    }

    render() {
      return Katrid.$templateCache.get(this.templateUrl);
    }
  }

  class ActionView extends BaseView{
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
      return sprintf(Katrid.$templateCache.get(this.templateUrl), this.getTemplateContext());
    }

    renderTo(parent) {
      Katrid.core.setContent(this.render(), this.scope);
    }
  }

  class View extends ActionView {
    getBreadcrumb() {
      let html = `<ol class="breadcrumb">`;
      let i = 0;
      for (let h of Katrid.Actions.actionManager.actions) {
        if (i === 0 && h.viewModes.length > 1)
          html += `<li class="breadcrumb-item"><a href="javascript:void(0)" ng-click="action.backTo(0, 0)">${ h.info.display_name }</a></li>`;
        i++;
        if (Katrid.Actions.actionManager.actions.length > i && h.viewType === 'form')
          html += `<li class="breadcrumb-item"><a href="javascript:void(0)" ng-click="action.backTo(${i-1}, 'form')">${ h.scope.record.display_name }</a></li>`;
      }
      if (this.constructor.type === 'form')
          html += `<li class="breadcrumb-item">{{ self.display_name }}</li>`;
      return html + '</ol>';
    }

    render() {
      return sprintf(Katrid.$templateCache.get(this.templateUrl), { content: this.content });
    }

    getViewButtons() {
      let btns = Object.entries(View.buttons).map((btn) => this.view.viewModes.includes(btn[0]) ? btn[1] : '').join('');
      if (btns) btns = `<div class="btn-group">${btns}</div>`;
      return btns;
    }

  }


  class FormView extends View {
    constructor(action, scope, view, content) {
      super(action, scope, view, content);
      this.templateUrl = 'view.form';
    }

    render() {
      let el = $(sprintf(Katrid.$templateCache.get(this.templateUrl), {
        content: this.content,
        breadcrumb: this.getBreadcrumb(),
        actions: ''
      }));
      let frm = el.find('form').first().addClass('row');
      // this.buildHeader(frm);
      return el;
    }
  }
  FormView.type = 'form';


  class ListView extends View {
    constructor(action, scope, view, content) {
      super(action, scope, view, content);
      this.templateUrl = 'view.list';
    }

    render() {
      let el = $(super.render());
      let content = $(this.content);
      const showSelector = true;
      let ths = Katrid.$templateCache.get('view.list.th.group');
      let cols = Katrid.$templateCache.get('view.list.td.group');
      if (showSelector) {
        ths += Katrid.$templateCache.get('view.list.th.selector');
        cols += Katrid.$templateCache.get('view.list.td.selector');
      }

      compileButtons(content);

      for (let col of content.children()) {
        col = $(col);
        let html = col.html();
        let name = col.attr('name');
        if (!name) {
          cols += `<td>${html}</td>`;
          ths += `<th><span>${col.attr('caption') || ''}</span></th>`;
          continue;
        }

        const fieldInfo = this.view.fields[name];

        if (!fieldInfo || (col.attr('visible') === 'False') || (fieldInfo.visible === false))
          continue;

        if (html) {
          cols += `<td>${html}</td>`;
          ths += `<th><span>${col.attr('caption')||fieldInfo.caption}</span></th>`;
          continue;
        }

        if (fieldInfo.choices) {
          fieldInfo._listChoices = {};
          for (let choice of Array.from(fieldInfo.choices)) {
            fieldInfo._listChoices[choice[0]] = choice[1];
          }
        }

        let _widget = Katrid.UI.Widgets[col.attr('widget') || fieldInfo.type] || Katrid.UI.Widgets.StringField;
        _widget = new _widget(this.scope, {}, fieldInfo, col);
        _widget.inList = true;
        ths += _widget.th();

        cols += _widget.td();
      }

      el.find('#replace-ths').replaceWith(ths);
      el.find('#replace-cols').replaceWith(cols);

      return el.html();
    }
  }
  ListView.type = 'list';

  class CardView extends View {
    constructor(action, scope, view, content) {
      super(action, scope, view, content);
      this.templateUrl = 'view.card';
    }

    render() {
      let content = $(this.content);
      let fieldList = Array.from(content.children('field')).map((el) => $(el).attr('name'));
      content.children('field').remove();
      content.find('field').each((idx, el) => $(el).replaceWith(`{{ ::record.${ $(el).attr('name') } }}`));
      console.log(this.content);
      return sprintf(Katrid.$templateCache.get(this.templateUrl), { content: content.html() });
    }
  }
  CardView.type = 'card';


  class Form {
    constructor() {
      this.restrict = 'E';
      this.scope = false;
    }

    buildHeader(form) {
      let newHeader = form.find('form header').first();
      form.find('form.full-width').closest('.container').removeClass('container').find('.card').first().addClass('full-width no-border');

      // Add form header
      if (newHeader.length) {
        let headerButtons = $('<div class="header-buttons"></div>');
        newHeader.prepend(headerButtons);
        compileButtons(newHeader)
        .each((idx, btn) => headerButtons.append(btn));
      } else
        newHeader = $('<header></header>');
      newHeader.addClass('content-container-heading');
      let header = form.find('header').first();
      header.replaceWith(newHeader);
      form.find('field[name=status]').prependTo(newHeader);
    }

    link(scope, element) {
      element.find('form.full-width').closest('.container').removeClass('container').find('.card').first().addClass('full-width no-border');
      scope.$parent.formElement = element.find('form').first();
      scope.$parent.form = angular.element(scope.formElement).controller('form');
    }

    template(element, attrs) {
      this.buildHeader(element);
      element.addClass('ng-form');
      return element.html();
    }
  }


  Katrid.uiKatrid.directive('formView', Form);


  Katrid.UI.Views = {
    View,
    BaseView,
    ActionView,
    FormView,
    ListView,
    CardView,
    ClientView,
    searchModes: [ListView.type, CardView.type]
  };

  Katrid.UI.Views[FormView.type] = FormView;
  Katrid.UI.Views[ListView.type] = ListView;
  Katrid.UI.Views[CardView.type] = CardView;

})();

(() => {
  class BaseObject {
    doAction(act) {
    }
  }

  class Widget extends BaseObject {

  }

  class Component extends BaseObject {
    controller($scope) {
      $scope.doAction = this.doAction;
    }
  }

  Katrid.UI.Widgets = {
    Widget,
    Component
  };
})();
