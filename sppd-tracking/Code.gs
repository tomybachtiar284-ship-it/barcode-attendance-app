function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet() {
  return HtmlService
    .createTemplateFromFile("index")
    .evaluate()
    .setTitle("Tracking Status SPPD MKP")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getData(nid) {
  try {
    const sheet = SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("FORM MONITORING SPPD MKP");

    if (!sheet) {
      return {
        success: false,
        message: "Sheet 'FORM MONITORING SPPD MKP' tidak ditemukan di Spreadsheet."
      };
    }

    const data = sheet.getDataRange().getValues();

    // Loop mencari baris dengan NID yang sesuai (kolom indeks 1 / kolom B)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim().toUpperCase() === String(nid).trim().toUpperCase()) {
        
        // Parsing Tanggal Kegiatan
        let tglKeg = data[i][5];
        if (tglKeg instanceof Date) {
          tglKeg = Utilities.formatDate(tglKeg, Session.getScriptTimeZone(), "dd-MM-yyyy");
        }
        
        // Parsing Tanggal Berangkat
        let tglBrk = data[i][6];
        if (tglBrk instanceof Date) {
          tglBrk = Utilities.formatDate(tglBrk, Session.getScriptTimeZone(), "dd-MM-yyyy");
        }
        
        // Parsing Tanggal Pulang
        let tglPlg = data[i][7];
        if (tglPlg instanceof Date) {
          tglPlg = Utilities.formatDate(tglPlg, Session.getScriptTimeZone(), "dd-MM-yyyy");
        }

        return {
          success: true,
          no: data[i][0] || "-",
          nid: data[i][1] || "-",
          nama: data[i][2] || "-",
          kegiatan: data[i][3] || "-",
          jabatan: data[i][4] || "-",
          tglKegiatan: tglKeg || "-",
          tglBerangkat: tglBrk || "-",
          tglPulang: tglPlg || "-",
          status: data[i][8] || "Pengajuan AMS ke Unit",
          nominal: data[i][9] || 0
        };
      }
    }

    return {
      success: false,
      message: "Data SPPD dengan NID '" + nid + "' tidak ditemukan."
    };
  } catch (err) {
    return {
      success: false,
      message: "Terjadi kesalahan sistem backend: " + err.toString()
    };
  }
}
