class ReportEngine {
  static load() {
    $('row').addClass('row');
    $('column').addClass('col');
    $('table').addClass('table table-sm');
    $('tr.auto-size>td').addClass('col');
  }
}

$(document).ready(() => {
  ReportEngine.load();
});
