<%namespace name="report" file="report.mako"/>
<%def name="includes()">
  <script src="${report.static('/static/web/assets/plugins/qr/qrcode.min.js')}"></script>
  <script>
    $(document).ready(() => {
      $('qrcode').each((idx, el) => {
        new QRCode(el, { text: $(el).attr('code'), height: 128, width: 128 });
      });
    })
  </script>
</%def>
