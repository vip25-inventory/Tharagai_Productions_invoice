/* ═══════════════════════════════════════════════════════════
   THARAGAI PRODUCTION — Invoice Generator · Script.js
   Production-ready version
   ═══════════════════════════════════════════════════════════ */

/* ── Payment Settings & Security ── */
// These can be updated by the merchant
const MERCHANT_UPI_ID = 'manojh1702-4@okaxis';
const MERCHANT_NAME = 'Manoj';
const PAYMENT_SECRET_KEY = 'TharagaiProductionSecureKey2026';

// Simple polynomial rolling hash signature generator
function generateSignature(amount, secretKey) {
  let hash = 0;
  const combined = amount + secretKey;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// XOR Encrypt/Decrypt helper to obfuscate the amount in the URL
function xorEncryptDecrypt(input, key) {
  let output = '';
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    output += String.fromCharCode(charCode);
  }
  return output;
}

// Base64 encoding/decoding for binary strings
function bytesToBase64(str) {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64ToBytes(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    return atob(base64);
  } catch (e) {
    return '';
  }
}

// Generate the secure token
function generatePaymentToken(amount, secretKey) {
  const sig = generateSignature(amount, secretKey);
  const payload = amount + '|' + sig;
  const encrypted = xorEncryptDecrypt(payload, secretKey);
  return bytesToBase64(encrypted);
}

/* ── State ── */
let svcs = [];
let phases = [
  { label: 'Phase 1', date: '', mode: '', amount: '', status: 'pending' },
  { label: 'Phase 2', date: '', mode: '', amount: '', status: 'pending' },
  { label: 'Final', date: '', mode: '', amount: '', status: 'pending' },
];

const isMob = () => window.innerWidth <= 700;

/* ──────────────────────────────────────────────────────────
   Preview scale
   Applies CSS transform to #inv on mobile so the 740px
   invoice fits the screen. On desktop the transform is
   cleared. Called after every sync() and on resize / tab
   switch. PDF generation temporarily removes the transform
   so html2canvas captures the true 740px layout.
   ────────────────────────────────────────────────────────── */
function updatePreviewScale() {
  const inv = el('inv');
  const scroller = document.querySelector('.preview-scroller');
  if (!inv || !scroller) return;

  if (!isMob()) {
    /* Desktop – remove any inline transform so layout is unchanged */
    inv.style.transform = '';
    inv.style.marginLeft = '';
    scroller.style.height = '';
    return;
  }

  const gap = window.innerWidth >= 480 ? 32 : 24;
  const scale = (window.innerWidth - gap) / 740;
  const marginL = gap / 2;

  inv.style.transform = `scale(${scale})`;
  inv.style.transformOrigin = 'top left';
  inv.style.marginLeft = marginL + 'px';

  /*
   * Use scrollHeight (true content height, unaffected by transform)
   * multiplied by scale to get the visual (on-screen) height.
   */
  requestAnimationFrame(() => {
    const visualH = Math.ceil(inv.scrollHeight * scale);
    scroller.style.height = (visualH + 24) + 'px';
  });
}

/* ── Tabs ── */
function switchTab(t) {
  const fp = el('panel-form'), pp = el('panel-preview');
  const tf = el('tab-form'), tp = el('tab-prev');
  if (t === 'form') {
    fp.classList.remove('hidden'); pp.classList.add('hidden');
    tf.classList.add('active'); tp.classList.remove('active');
  } else {
    pp.classList.remove('hidden'); fp.classList.add('hidden');
    tp.classList.add('active'); tf.classList.remove('active');
    sync();
    updatePreviewScale();
  }
}

function onResize() {
  const fp = el('panel-form'), pp = el('panel-preview');
  if (!isMob()) { fp.classList.remove('hidden'); pp.classList.remove('hidden'); }
  updatePreviewScale();
}
window.addEventListener('resize', onResize);

/* ── Services ── */
var MAX_SVCS = 10;

function addSvc(d) {
  if (svcs.length >= MAX_SVCS) {
    alert('Maximum ' + MAX_SVCS + ' services allowed per invoice (single-page limit).');
    return;
  }
  d = d || {};
  svcs.push({
    id: Date.now() + Math.random(),
    name: d.name || '',
    qty: d.qty || '',
    rate: d.rate || '',
  });
  renderSvcs();
  sync();
}

function rmSvc(id) {
  svcs = svcs.filter(function (s) { return s.id !== id; });
  renderSvcs();
  sync();
}

function renderSvcs() {
  const D = el('svc-desktop'), M = el('svc-mobile');
  D.innerHTML = ''; M.innerHTML = '';

  /* Update the Add Service button */
  var btnAdd = document.querySelector('.btn-add');
  if (btnAdd) {
    if (svcs.length >= MAX_SVCS) {
      btnAdd.disabled = true;
      btnAdd.title = 'Maximum ' + MAX_SVCS + ' services reached (single-page limit)';
      btnAdd.textContent = '✓ Max 10 Services Reached';
    } else {
      btnAdd.disabled = false;
      btnAdd.title = '';
      btnAdd.textContent = '+ Add Service';
    }
  }

  svcs.forEach(function (s, i) {
    /* Desktop row */
    const row = document.createElement('div');
    row.className = 'item-row-d';
    row.innerHTML =
      '<input type="text"   placeholder="Service name" value="' + esc(s.name) + '"'
      + ' oninput="svcs[' + i + '].name=this.value;sync()">'
      + '<input type="number" placeholder="1"    value="' + esc(s.qty) + '" min="0"'
      + ' oninput="svcs[' + i + '].qty=this.value;sync()">'
      + '<input type="number" placeholder="0.00" value="' + esc(s.rate) + '" min="0" step="0.01"'
      + ' oninput="svcs[' + i + '].rate=this.value;sync()">'
      + '<button class="btn-rm" onclick="rmSvc(' + s.id + ')">×</button>';
    D.appendChild(row);

    /* Mobile card */
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML =
      '<div class="icard-hdr">'
      + '<span class="icard-num">Service ' + (i + 1) + '</span>'
      + '<button class="btn-rm" onclick="rmSvc(' + s.id + ')">×</button>'
      + '</div>'
      + '<div class="form-group"><label>Service Name</label>'
      + '<input type="text" placeholder="e.g. Brand Video Production" value="' + esc(s.name) + '"'
      + ' oninput="svcs[' + i + '].name=this.value;sync()"></div>'
      + '<div class="icard-grid">'
      + '<div class="form-group"><label>Qty / Hrs</label>'
      + '<input type="number" placeholder="1" value="' + esc(s.qty) + '" min="0"'
      + ' oninput="svcs[' + i + '].qty=this.value;sync()"></div>'
      + '<div class="form-group"><label>Rate (₹)</label>'
      + '<input type="number" placeholder="0.00" value="' + esc(s.rate) + '" min="0" step="0.01"'
      + ' oninput="svcs[' + i + '].rate=this.value;sync()"></div>'
      + '</div>';
    M.appendChild(card);
  });
}

/* ── Payment Phases form ── */
function renderPhaseForm() {
  const c = el('phases-form');
  c.innerHTML = '';
  const modes = ['', 'UPI', 'Bank Transfer', 'Cash', 'Cheque', 'NEFT/RTGS'];
  const statuses = [['pending', 'Pending'], ['partial', 'Partial'], ['received', 'Received']];

  phases.forEach(function (ph, i) {
    const g = document.createElement('div');
    g.style.marginBottom = '14px';

    const modeOpts = modes.map(function (m) {
      return '<option value="' + m + '"' + (ph.mode === m ? ' selected' : '') + '>' + (m || '—') + '</option>';
    }).join('');

    const statusOpts = statuses.map(function (pair) {
      return '<option value="' + pair[0] + '"' + (ph.status === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
    }).join('');

    g.innerHTML =
      '<div class="form-group" style="margin-bottom:6px;">'
      + '<span style="font-size:.78rem;font-weight:700;color:var(--indigo);letter-spacing:.06em;text-transform:uppercase;">' + ph.label + '</span>'
      + '</div>'
      + '<div class="form-row" style="gap:8px;">'
      + '<div class="form-group"><label>Date</label>'
      + '<input type="date" value="' + ph.date + '" oninput="phases[' + i + '].date=this.value;sync()"></div>'
      + '<div class="form-group"><label>Mode</label>'
      + '<select onchange="phases[' + i + '].mode=this.value;sync()">' + modeOpts + '</select></div>'
      + '</div>'
      + '<div class="form-row" style="gap:8px;">'
      + '<div class="form-group"><label>Amount (₹)</label>'
      + '<input type="number" placeholder="0.00" value="' + ph.amount + '" min="0" step="0.01"'
      + ' oninput="phases[' + i + '].amount=this.value;sync()"></div>'
      + '<div class="form-group"><label>Status</label>'
      + '<select onchange="phases[' + i + '].status=this.value;sync()">' + statusOpts + '</select></div>'
      + '</div>';
    c.appendChild(g);
  });
}

/* ── Number to Words (Indian system) ── */
function n2w(n) {
  var ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (n === 0) return 'Zero';
  var w = '';
  if (n >= 10000000) { w += n2w(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
  if (n >= 100000) { w += n2w(Math.floor(n / 100000)) + ' Lakh '; n %= 100000; }
  if (n >= 1000) { w += n2w(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
  if (n >= 100) { w += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
  if (n >= 20) { w += tens[Math.floor(n / 10)] + ' '; n %= 10; }
  if (n > 0) { w += ones[n] + ' '; }
  return w.trim();
}

function amt2w(a) {
  var rupees = Math.floor(a);
  var paise = Math.round((a - rupees) * 100);
  return n2w(rupees) + ' Rupees' + (paise > 0 ? ' and ' + n2w(paise) + ' Paise' : '') + ' Only';
}

/* ── Sync: push all form data into the preview ── */
function sync() {
  var cname = v('f-cname'), cmob = v('f-cmobile');
  var cemail = v('f-cemail'), caddr = v('f-caddr'), cgstin = v('f-cgstin');
  var invno = v('f-invno'), invdate = v('f-invdate'), duedate = v('f-duedate');
  var proj = v('f-project');
  var cgstVal = v('f-cgst');
  var sgstVal = v('f-sgst');
  var cgstPct = parseFloat(cgstVal) || 0;
  var sgstPct = parseFloat(sgstVal) || 0;

  // ── Input Validations ──
  // 1. Mobile number validation (if not empty)
  var isMobValid = true;
  if (cmob) {
    var cleanMob = cmob.replace(/[\s-()]/g, '');
    isMobValid = /^(?:\+91|0)?[6-9]\d{9}$/.test(cleanMob);
  }
  setFieldError('f-cmobile', isMobValid, 'Invalid mobile number (e.g. 9876543210)');

  // 2. Email validation (if not empty)
  var isEmailValid = true;
  if (cemail) {
    isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cemail);
  }
  setFieldError('f-cemail', isEmailValid, 'Invalid email address (e.g. name@domain.com)');

  // 3. GSTIN validation (if not empty, 15-character alphanumeric capital format)
  var isGstinValid = true;
  if (cgstin) {
    isGstinValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/.test(cgstin.toUpperCase());
  }
  setFieldError('f-cgstin', isGstinValid, 'Invalid GSTIN format (e.g. 33AAAAA1111A1ZB)');

  // 4. CGST & SGST percentage validation (0% to 28% if filled)
  var isCgstValid = cgstVal === '' || (!isNaN(cgstVal) && parseFloat(cgstVal) >= 0 && parseFloat(cgstVal) <= 28);
  setFieldError('f-cgst', isCgstValid, 'Must be between 0 and 28');

  var isSgstValid = sgstVal === '' || (!isNaN(sgstVal) && parseFloat(sgstVal) >= 0 && parseFloat(sgstVal) <= 28);
  setFieldError('f-sgst', isSgstValid, 'Must be between 0 and 28');

  // 5. UPI amount validation (if not empty)
  var upiAmt = v('f-upiamt');
  var isUpiAmtValid = upiAmt === '' || (!isNaN(upiAmt) && parseFloat(upiAmt) > 0);
  setFieldError('f-upiamt', isUpiAmtValid, 'Must be a positive number');

  // Disable print/Save as PDF button if any input is invalid
  var btnPdf = el('btn-pdf');
  if (btnPdf) {
    var hasInvalid = document.querySelector('.form-panel .invalid') !== null;
    btnPdf.disabled = hasInvalid;
    if (hasInvalid) {
      btnPdf.title = 'Please fix validation errors before saving';
    } else {
      btnPdf.title = "Opens print dialog — select 'Save as PDF' then press Save";
    }
  }

  // ── UPI QR Code Generation ──
  var qrContainer = el('p-qr-container');
  if (upiAmt && isUpiAmtValid && parseFloat(upiAmt) > 0) {
    var amtStr = parseFloat(upiAmt).toFixed(2);
    // Direct UPI link for QR code scanning (fastest for payment apps)
    var upiUrl = 'upi://pay?pa=' + encodeURIComponent(MERCHANT_UPI_ID) + '&pn=' + encodeURIComponent(MERCHANT_NAME) + '&am=' + amtStr + '&cu=INR';
    // Generate secure token from the amount
    var token = generatePaymentToken(amtStr, PAYMENT_SECRET_KEY);
    // Determine the base URL dynamically relative to the current file location
    var baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    var redirectUrl = 'https://tp-payment.vercel.app/?token=' + token;

    var qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(upiUrl);
    el('p-qr-img').src = qrImgUrl;
    el('p-qr-link').href = redirectUrl;
    qrContainer.style.display = 'block';
  } else {
    qrContainer.style.display = 'none';
  }

  /* Invoice meta */
  set('p-invno', invno ? '#' + invno : '#TP-2026-001');
  var datesHtml = '';
  if (invdate) datesHtml += 'Date: ' + fmtDate(invdate) + '<br>';
  if (duedate) datesHtml += 'Due: ' + fmtDate(duedate);
  el('p-dates').innerHTML = datesHtml || '&nbsp;';

  /* Client details */
  var rows = [];
  if (cname) rows.push(detailRow('Name', cname));
  if (cmob) rows.push(detailRow('Mobile No', cmob));
  if (cemail) rows.push(detailRow('Email', cemail));
  if (caddr) rows.push(detailRow('Address', caddr));
  if (cgstin) rows.push(detailRow('GSTIN', cgstin.toUpperCase(), true));
  el('p-cdetail').innerHTML = rows.join('') || '&nbsp;';

  set('p-project', proj || '—');

  /* Services table — always render fully (no early return) */
  var tbody = el('p-svc-body');
  var sub = 0;

  if (svcs.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:18px;">No services added yet</td></tr>';
  } else {
    tbody.innerHTML = svcs.map(function (s, i) {
      var q = parseFloat(s.qty) || 0;
      var r = parseFloat(s.rate) || 0;
      var tot = q * r;
      sub += tot;
      return '<tr>'
        + '<td class="c">' + (i + 1) + '</td>'
        + '<td><div class="inv-svc-name">' + (s.name || '—') + '</div></td>'
        + '<td class="r">' + q + '</td>'
        + '<td class="r">₹' + r.toFixed(2) + '</td>'
        + '<td class="r">' + cgstPct + '%</td>'
        + '<td class="r">' + sgstPct + '%</td>'
        + '<td class="r">₹' + tot.toFixed(2) + '</td>'
        + '</tr>';
    }).join('');
  }

  calcTotals(sub, cgstPct, sgstPct);

  /* Payment phases — always rendered */
  var pb = el('p-phase-body');
  var hasPhase = phases.some(function (p) { return p.date || p.amount; });

  if (!hasPhase) {
    pb.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:12px;">No phases set</td></tr>';
  } else {
    var badgeMap = { pending: 'badge-pending', received: 'badge-received', partial: 'badge-partial' };
    var labelMap = { pending: 'Pending', received: 'Received', partial: 'Partial' };
    pb.innerHTML = phases.map(function (p) {
      return '<tr>'
        + '<td><strong>' + p.label + '</strong></td>'
        + '<td>' + (p.date ? fmtDate(p.date) : '—') + '</td>'
        + '<td>' + (p.mode || '—') + '</td>'
        + '<td>₹' + (p.amount || '0.00') + '</td>'
        + '<td><span class="badge ' + (badgeMap[p.status] || 'badge-pending') + '">'
        + (labelMap[p.status] || 'Pending') + '</span></td>'
        + '</tr>';
    }).join('');
  }

  /* Terms & Conditions — always rendered */
  var terms = v('f-terms').split('\n').filter(function (l) { return l.trim(); });
  el('p-terms-list').innerHTML =
    terms.map(function (l) { return '<li>' + l + '</li>'; }).join('') || '<li>—</li>';

  updatePreviewScale();
}

/* Build an inline "Label : Value" detail row for the client block.
   Pass uppercase=true to force the value to ALL-CAPS (used for GSTIN). */
function detailRow(label, value, uppercase) {
  var valClass = 'value' + (uppercase ? ' value--upper' : '');
  return '<div class="inv-billto-detail">'
    + '<span class="label">' + label + '</span>'
    + '<span class="sep">:</span>'
    + '<span class="' + valClass + '">' + value + '</span>'
    + '</div>';
}

/* Helper to set visual field errors dynamically */
function setFieldError(id, isValid, message) {
  var element = el(id);
  if (!element) return;

  var parent = element.parentNode;
  var existingError = parent.querySelector('.error-msg');

  if (!isValid) {
    element.classList.add('invalid');
    if (!existingError) {
      existingError = document.createElement('span');
      existingError.className = 'error-msg';
      parent.appendChild(existingError);
    }
    existingError.textContent = message;
  } else {
    element.classList.remove('invalid');
    if (existingError) {
      parent.removeChild(existingError);
    }
  }
}

/* Calculate and display totals */
function calcTotals(sub, cp, sp) {
  var cgstAmt = sub * cp / 100;
  var sgstAmt = sub * sp / 100;
  var gross = sub + cgstAmt + sgstAmt;
  var net = Math.round(gross);
  var paise = (net - gross).toFixed(2);

  set('p-sub', sub.toFixed(2));
  set('p-cgst-amt', cgstAmt.toFixed(2));
  set('p-sgst-amt', sgstAmt.toFixed(2));
  set('p-paise', Math.abs(parseFloat(paise)) < 0.005 ? '0.00' : paise);
  set('p-net', net.toFixed(2));
  set('p-words', net > 0 ? amt2w(net) : '—');
}

/* ── Print / Save as PDF ── */
function genPDF() {
  var inv = el('inv');
  var pp = el('panel-preview');
  var wasHidden = pp.classList.contains('hidden');

  /* Show preview panel (needed if user is on form tab on mobile) */
  if (wasHidden) pp.classList.remove('hidden');

  /* Push latest form values into the preview */
  sync();

  /* Remove mobile scale transform — print must capture full-size layout */
  var savedTransform = inv.style.transform;
  var savedMarginL = inv.style.marginLeft;
  inv.style.transform = "none";
  inv.style.marginLeft = '0';

  /* Restore UI silently once the print dialog closes */
  function afterPrint() {
    window.removeEventListener('afterprint', afterPrint);
    inv.style.transform = savedTransform;
    inv.style.marginLeft = savedMarginL;
    if (wasHidden) pp.classList.add('hidden');
    updatePreviewScale();
  }

  window.addEventListener('afterprint', afterPrint);

  /* Open native print dialog */
  window.print();
}

/* ── Utility helpers ── */
function el(id) { return document.getElementById(id); }
function v(id) { var e = el(id); return e ? e.value.trim() : ''; }
function set(id, val) { var e = el(id); if (e) e.textContent = val; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function fmtDate(d) {
  if (!d) return '';
  var parts = d.split('-');
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

/* ── Initialise ── */
window.onload = function () {
  var today = new Date().toISOString().split('T')[0];
  el('f-invdate').value = today;
  el('f-invno').value = 'TP-' + new Date().getFullYear() + '-001';
  addSvc();
  renderPhaseForm();
  sync();
  onResize();
  updatePreviewScale();
};