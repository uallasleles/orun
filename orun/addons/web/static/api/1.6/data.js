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
      // this.onFieldChange = this.onFieldChange.bind(this);
      this.fields = [];
      this.scope = scope;
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

    get loadingAction() {
      return this._loadingAction;
    }

    set loadingAction(v) {
      if (v) this.requestInterval = 0;
      else this.requestInterval = DEFAULT_REQUEST_INTERVAL;
      this._loadingAction = v;
    }

    cancel() {
      this._pendingChanges = false;
      if ((this.state === DataSourceState.inserting) && Katrid.Settings.UI.goToDefaultViewAfterCancelInsert) {
        this.record = {};
        this.scope.action.setViewType('list');
      } else {
        if (this.state === DataSourceState.editing) {
          const r = this.refresh([this.scope.record.id]);
          if (r && $.isFunction(r.promise))
            r.done(() => {
              return this.state = DataSourceState.browsing;
            });
          else
            this.state = DataSourceState.browsing;
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
        return r.done(res => {
          if (res.ok && res.result)
            this.scope.result = res.result;

          return $(this.scope.root).closest('.modal').modal('toggle');
        });
      }
    }

    save(autoRefresh=true) {
      // Submit fields with dirty state only
      const el = this.scope.formElement;
      if (this.validate()) {
        const data = this.getModifiedData(this.scope.form, el, this.scope.record);
        this.scope.form.data = data;

        let beforeSubmit = el.attr('before-submit');
        if (beforeSubmit)
          beforeSubmit = this.scope.$eval(beforeSubmit);

        //@scope.form.data = null

        if (data) {
          this.uploading++;
          return this.scope.model.write([data])
          .done(res => {

            this.scope.action.location.search('id', res[0]);
            this.scope.form.$setPristine();
            this.scope.form.$setUntouched();
            if (this.children)
              this.children.map((child) => {
                child.scope.dataSet = [];
                delete child.modifiedData;
                child.scope.masterChanged(this.scope.recordId);
              });
            this._pendingChanges = false;
            this.state = DataSourceState.browsing;
            if (autoRefresh)
              return this.refresh(res);

          })
          .fail(error => {

            let s = `<span>${Katrid.i18n.gettext('The following fields are invalid:')}<hr></span>`;
            if (error.message)
              s = error.message;
            else if (error.messages) {
              let elfield;
              for (let fld in error.messages) {
                const msgs = error.messages[fld];
                const field = this.scope.view.fields[fld];
                elfield = el.find(`.form-field[name="${field.name}"]`);
                elfield.addClass('ng-invalid ng-touched');
                s += `<strong>${field.caption}</strong><ul>`;
                for (let msg of Array.from(msgs)) {
                  s += `<li>${msg}</li>`;
                }
                s += '</ul>';
              }
              if (elfield)
                elfield.focus();
            }

            return Katrid.Dialogs.Alerts.error(s);

          })
          .always(() => this.scope.$apply(() => this.uploading-- ) );
        } else
          Katrid.Dialogs.Alerts.warn(Katrid.i18n.gettext('No pending changes'));
      }
    }

    copy(id) {
      return this.scope.model.copy(id)
      .done(res => {
        this.record = {};
        this.state = DataSourceState.inserting;
        this.setValues(res);
        this.scope.$apply();
      });
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
      if (data) {
        // Refresh current record
        return this.get(data[0]);
      } else if (this.scope.record.id) {
        return this.get(this.scope.record.id);
      } else {
        return this.search(this._params, this._page);
      }
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

    search(params, page, fields) {
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

      const def = new $.Deferred();

      let req = () => {
        this.scope.model.search(params)
        .fail(res => {
          return def.reject(res);
        }).done(res => {
          if (this.pageIndex > 1) {
            this.offset = ((this.pageIndex - 1) * this.pageLimit) + 1;
          } else {
            this.offset = 1;
          }
          this.scope.$apply(() => {
            if (res.count != null) {
              this.recordCount = res.count;
            }
            this.scope.records = res.data;
            if (this.pageIndex === 1) {
              return this.offsetLimit = this.scope.records.length;
            } else {
              return this.offsetLimit = (this.offset + this.scope.records.length) - 1;
            }
          });
          return def.resolve(res);
        }).always(() => {
          this.pendingRequest = false;
          this.scope.$apply(() => {
            return this.loading = false;
          });
        });
      };

      if (this.requestInterval > 0) this.pendingRequest = setTimeout(req, this.requestInterval);
      else req();

      return def.promise();
    }

    groupBy(group) {
      if (!group) {
        this.groups = [];
        return;
      }
      this.scope.groupings = [];
      this.groups = [group];
      return this.scope.model.groupBy(group.context)
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
            this.scope.model.search({params: r._domain})
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
      return clearTimeout(this.pendingRequest);
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
          record[attr] = v;
        }

        this.modifiedData = ds;
        this.masterSource.scope.form.$setDirty();
      }
      return data;
    }

    getModifiedData(form, element, record) {
      if (record.$deleted) {
        if (record.id) {
          return {
            id: record.id,
            $deleted: true
          };
        }
        return;
      }
      if (form.$dirty || this._modifiedFields.length) {
        const data = {};
        for (let el of Array.from($(element).find('.form-field.ng-dirty'))) {
          const nm = el.name;
          if (nm) {
            data[nm] = record[nm];
          }
        }

        for (let child of Array.from(this.children)) {
          const subData = data[child.fieldName] || [];
          for (let attr in child.modifiedData) {
            let obj = child.modifiedData[attr];
            if (obj.$deleted) {
              obj = {
                action: 'DESTROY',
                id: obj.id
              };
            } else if (obj.id) {
              obj = {
                action: 'UPDATE',
                values: obj
              };
            } else {
              obj = {
                action: 'CREATE',
                values: obj
              };
            }
            subData.push(obj);
          }
          if (subData) {
            data[child.fieldName] = subData;
          }
        }

        // Check invisible fields
        for (let f of Array.from(this._modifiedFields)) {
          data[f] = record[f];
        }

        if (data) {
          if (record.id) {
            data.id = record.id;
          }
          return data;
        }
      }

    }

    get(id, timeout) {
      this._clearTimeout();
      this.state = DataSourceState.loading;
      this.loadingRecord = true;
      const def = new $.Deferred();

      const _get = () => {
        return this.scope.model.getById(id)
        .fail(res => {
          return def.reject(res);
      }).done(res => {
          this.scope.$apply(() => {
            return this.record = res.data[0];
          });
          return def.resolve(res);
        }).always(() => {
          // this.setState(DataSourceState.browsing);
          return this.scope.$apply(() => {
            return this.loadingRecord = false;
          });
        });
      };

      if (!timeout && !this.requestInterval) return _get();
      else this.pendingRequest = setTimeout(_get, timeout || this.requestInterval);

      return def.promise();
    }

    insert() {
      this.record = {};
      return this.scope.model.getDefaults()
      .done(res => {
        this.scope.$apply(() => {
          this.state = DataSourceState.inserting;
          this.scope.record.display_name = Katrid.i18n.gettext('(New)');
          if (res.result)
            this.setValues(res.result);

        });
      });
    }

    _new() {
      return Katrid.Data.createRecord({}, this.scope);
    }

    setValues(values) {
      for (let attr in values) {
        let v = values[attr];
        this.scope.record[attr] = v;
        continue;
        const control = this.scope.form[attr];
        if (control) {
          if (v) {
            v = this.toClientValue(attr, v);
          }
          control.$setDirty();
          // Force dirty (bug fix for boolean (false) value
          if (v === false) {
            this.scope.record[attr] = v;
            control.$setDirty();
          }
        } else {
          this._modifiedFields.push(attr);
        }
        this.scope.record[attr] = v;
      }
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

    set state(state) {
      // Clear modified fields information
      this._modifiedFields = [];
      this._state = state;
      this.inserting = state === DataSourceState.inserting;
      this.editing = state === DataSourceState.editing;
      this.loading = state === DataSourceState.loading;
      this.browsing = state === DataSourceState.browsing;
      this.changing =  [DataSourceState.editing, DataSourceState.inserting].includes(this.state);
    }

    get state() {
      return this._state;
    }

    set record(rec) {
      // Track field changes
      this.scope.record = Katrid.Data.createRecord(rec, this.scope);
      this.scope.recordId = rec.id;
      this._pendingChanges = false;
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
      this.scope.action.location.search('id', this.scope.records[index].id);
    }

    get recordIndex() {
      return this._recordIndex;
    }

    // onFieldChange(res) {
    //   if (res.ok && res.result.fields) {
    //     return this.scope.$apply(() => {
    //       return (() => {
    //         const result = [];
    //         for (let f in res.result.fields) {
    //           const v = res.result.fields[f];
    //           result.push(this.scope.$set(f, v));
    //         }
    //         return result;
    //       })();
    //     });
    //   }
    // }

    // fieldChange(meth, params) {
    //   return this.scope.model.post(meth, null, { kwargs: params })
    //   .done(res => {
    //     return this.scope.$apply(() => {
    //       if (res.ok) {
    //         if (res.result.values) {
    //           return this.setFields(res.result.values);
    //         }
    //       }
    //     });
    //   });
    // }

    expandGroup(index, row) {
      const rg = row._group;
      const params =
        {params: {}};
      params.params[rg._paramName] = rg._paramValue;
      return this.scope.model.search(params)
      .then(res => {
        if (res.ok && res.result.data) {
          return this.scope.$apply(() => {
            rg._children = res.result.data;
            return this.scope.records.splice.apply(this.scope.records, [index + 1, 0].concat(res.result.data));
          });
        }
      });
    }

    collapseGroup(index, row) {
      const group = row._group;
      this.scope.records.splice(index + 1, group._children.length);
      return delete group._children;
    }
  }


  Katrid.Data = {
    DataSource,
    DataSourceState
  };

})();