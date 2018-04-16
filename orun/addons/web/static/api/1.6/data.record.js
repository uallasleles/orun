(function() {

  class Record {
    constructor(res) {
      // this.res = res;
      // this.data = this.res.data;
    }
  }


  function createRecord(rec, scope) {
    return new Proxy(rec, {
      set(target, propKey, value, receiver) {
        if (!propKey.startsWith('$') && scope) {
          scope.$setDirty(propKey);
          scope.dataSource._pendingChanges = true;
          if (!rec.$modified) {
            rec.$modifiedData = {};
            rec.$modified = true;
            rec.$old = jQuery.extend({}, rec);
          }
          let fld = scope.dataSource.fieldByName(propKey);
          if (!(fld instanceof Katrid.Data.Fields.ManyToManyField))
            rec.$modifiedData[propKey] = fld.toJson(value);
        }
        if (scope.dataSource.$modifiedRecords.indexOf(rec) === -1)
          scope.dataSource.$modifiedRecords.push(rec);
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

  Katrid.Data.Record = Record;
  Katrid.Data.RecordState = RecordState;
  Katrid.Data.createRecord = createRecord;

})();