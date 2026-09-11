// 주택 재산세 계산기.
//
// 사람들이 아는 값은 공시가격 하나다. 공정시장가액비율·특례세율·도시지역분·
// 지방교육세·납기 분할까지는 고지서를 받고서야 안다. 그걸 대신 계산한다.
//
// 기존 계산기는 "1주택 여부"를 안 묻거나(60% 로 계산해 과다), 본세만 보여준다
// (도시지역분·교육세를 빼서 과소). 고지서 금액과 다르면 신뢰를 잃으니 셋을 다 더한다.
//
// 근거: 지방세법 제110조(과세표준)·제111조(세율)·제111조의2(1세대1주택 특례세율),
//       지방세법 시행령 제109조(공정시장가액비율), 제112조(도시지역분), 지방교육세법 제151조

(function () {
  "use strict";

  // ── 기준값 (2026년) ────────────────────────────────────────

  // 공정시장가액비율. 1세대1주택은 공시가격 구간별 특례, 그 외는 60%.
  var FMV_ONE_HOME = [
    { under: 300000000, ratio: 0.43 },
    { under: 600000000, ratio: 0.44 },
    { under: Infinity,  ratio: 0.45 },
  ];
  var FMV_OTHER = 0.60;

  // 표준세율. [과세표준 상한, 세율, 누진공제]
  var RATE_STD = [
    [60000000,  0.0010, 0],
    [150000000, 0.0015, 30000],
    [300000000, 0.0025, 180000],
    [Infinity,  0.0040, 630000],
  ];
  // 1세대1주택 특례세율(공시가격 9억 이하). 구간마다 0.05%p 낮다.
  var RATE_ONE_HOME = [
    [60000000,  0.0005, 0],
    [150000000, 0.0010, 30000],
    [300000000, 0.0020, 180000],
    [Infinity,  0.0035, 630000],
  ];
  var ONE_HOME_CAP = 900000000;      // 특례세율 적용 공시가격 상한

  var URBAN_RATE = 0.0014;           // 도시지역분 (도시계획구역 안 주택)
  var EDU_RATE = 0.20;               // 지방교육세 = 재산세 본세의 20%
  var SPLIT_MIN = 200000;            // 본세 20만원 초과면 7월·9월 반씩. 이하면 7월에 전액
  var INSTALLMENT_MIN = 2500000;     // 250만원 초과면 분납 신청 가능

  // 세부담상한. 2029년 폐지 예정이라 2026년에는 아직 산다. 전년 세액을 넣었을 때만 쓴다.
  var BURDEN_CAP = [
    { under: 300000000, ratio: 1.05 },
    { under: 600000000, ratio: 1.10 },
    { under: Infinity,  ratio: 1.30 },
  ];

  // ── 계산 ──────────────────────────────────────────────────

  function pick(table, v) {
    for (var i = 0; i < table.length; i += 1) if (v <= table[i].under) return table[i].ratio;
    return table[table.length - 1].ratio;
  }

  function progressive(base, table) {
    for (var i = 0; i < table.length; i += 1) {
      if (base <= table[i][0]) return { tax: base * table[i][1] - table[i][2], rate: table[i][1] };
    }
    return { tax: 0, rate: 0 };
  }

  function calculate(i) {
    var fmv = i.oneHome ? pick(FMV_ONE_HOME, i.price) : FMV_OTHER;
    var base = Math.floor(i.price * fmv);

    var special = i.oneHome && i.price <= ONE_HOME_CAP;
    var p = progressive(base, special ? RATE_ONE_HOME : RATE_STD);
    var main = Math.floor(p.tax);

    // 특례 없이 냈다면 얼마인지. 특례로 얼마 덜 내는지 보여주려면 필요하다.
    var stdMain = Math.floor(progressive(base, RATE_STD).tax);

    var urban = i.urban ? Math.floor(base * URBAN_RATE) : 0;
    var edu = Math.floor(main * EDU_RATE);
    var total = main + urban + edu;

    // 세부담상한. 전년 재산세(본세+도시지역분 합, 교육세 제외)를 넣은 경우에만.
    var capped = false, capAmount = null;
    if (i.lastYear > 0) {
      var capRatio = pick(BURDEN_CAP, i.price);
      capAmount = Math.floor(i.lastYear * capRatio);
      if (main + urban > capAmount) {
        capped = true;
        var scale = capAmount / (main + urban);
        main = Math.floor(main * scale); urban = Math.floor(urban * scale);
        edu = Math.floor(main * EDU_RATE);
        total = main + urban + edu;
      }
    }

    // 납기. 주택분은 본세 기준 20만원 초과면 7·9월 절반씩.
    var split = main > SPLIT_MIN;
    var july = split ? Math.floor(total / 2) : total;
    var sept = split ? total - july : 0;

    return {
      price: i.price, oneHome: i.oneHome, urbanOn: i.urban, fmv: fmv, base: base,
      special: special, rate: p.rate, main: main, stdMain: stdMain, saved: special ? stdMain - main : 0,
      urban: urban, edu: edu, total: total,
      capped: capped, capAmount: capAmount, lastYear: i.lastYear,
      split: split, july: july, sept: sept,
      installment: total > INSTALLMENT_MIN,
      share: i.share, mine: i.share < 100 ? Math.floor(total * i.share / 100) : total,
    };
  }

  // ── 화면 ──────────────────────────────────────────────────

  function won(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }
  function pct(r) { return (Math.round(r * 10000) / 100) + "%"; }

  function line(label, value, note) {
    return '<li><span class="bd-label">' + label + '</span><span class="bd-value">' + value + "</span>" +
           (note ? '<span class="bd-note">' + note + "</span>" : "") + "</li>";
  }

  function render(r) {
    var box = document.getElementById("calc-result");
    var html = "";

    html += '<p class="calc-label">공시가격 ' + won(r.price) + " · " + (r.oneHome ? "1세대 1주택" : "다주택·법인 등") + "</p>";
    html += '<p class="calc-amount">연 ' + won(r.total) + "</p>";
    html += '<p class="calc-sub">' + (r.split
      ? "7월 " + won(r.july) + " · 9월 " + won(r.sept) + " 두 번에 나옵니다"
      : "본세가 20만원 이하라 7월에 한 번에 나옵니다") + "</p>";
    if (r.share < 100) {
      html += '<p class="calc-sub">지분 ' + r.share + "% 몫은 <strong>" + won(r.mine) + "</strong></p>";
    }

    html += '<div class="calc-breakdown"><h4>고지서에 이렇게 나옵니다</h4><ul>';
    html += line("과세표준", won(r.base), "공시가격 × 공정시장가액비율 " + pct(r.fmv) +
      (r.oneHome ? " (1주택 특례 비율)" : " (다주택·법인 60%)"));
    html += line("재산세 본세", won(r.main),
      (r.special ? "1세대 1주택 특례세율 " : "표준세율 ") + pct(r.rate) + " 구간" +
      (r.saved > 0 ? " · 특례로 " + won(r.saved) + " 덜 냅니다" : ""));
    if (r.urbanOn) html += line("도시지역분", won(r.urban), "과세표준 × 0.14%. 고지서에 '재산세(도시지역분)' 으로 따로 찍힙니다");
    html += line("지방교육세", won(r.edu), "재산세 본세 × 20%");
    if (r.capped) html += line("세부담상한 적용", won(r.capAmount), "전년 세액 " + won(r.lastYear) + " 대비 상한에 걸려 그만큼만 오릅니다");
    html += line("합계", "<strong>" + won(r.total) + "</strong>", "지역자원시설세(소방분)는 건물 시가표준액 기준이라 여기 안 들어갑니다");
    html += "</ul></div>";

    html += '<ul class="calc-notes">';
    if (r.oneHome && r.price > ONE_HOME_CAP) {
      html += "<li>공시가격이 9억원을 넘어 <strong>특례세율은 못 받고</strong> 특례 공정시장가액비율(45%)만 적용됩니다</li>";
    }
    if (r.installment) {
      html += "<li>합계가 250만원을 넘어 <strong>분납 신청</strong>이 됩니다. 납기 안에 구청·위택스로 신청하면 두 달 뒤까지 나눠 냅니다</li>";
    }
    if (!r.capped && r.lastYear === 0) {
      html += "<li>작년 재산세를 넣으시면 <strong>세부담상한</strong>(공시가격 3억 이하 105% · 6억 이하 110% · 초과 130%)까지 봅니다. 공시가격이 많이 오른 해에 실제 고지액이 이 계산보다 낮게 나오는 이유가 그것입니다</li>";
    }
    html += "<li>6월 1일 현재 소유자에게 나옵니다. 5월 말에 팔았으면 안 내고, 6월 2일에 샀으면 안 냅니다</li>";
    html += "<li>공동명의면 지분대로 각자 고지됩니다. 세율은 사람별이 아니라 <strong>주택 전체 과세표준</strong>으로 정합니다</li>";
    html += "<li>공시가격은 <a href=\"https://www.realtyprice.kr\" target=\"_blank\" rel=\"noopener\">부동산공시가격알리미</a>에서 조회됩니다. 실거래가나 호가가 아닙니다</li>";
    html += "</ul>";

    html += '<div class="calc-actions">';
    html += '<a class="calc-btn primary" href="https://www.wetax.go.kr" target="_blank" rel="noopener">위택스에서 내 고지서 확인</a>';
    html += "</div>";

    html += '<div class="calc-share">';
    html += '<span class="calc-share-label">결과 공유하기</span>';
    html += '<div class="calc-share-btns">';
    html += '<button class="share-btn kakao" type="button" data-share="native">카카오톡·메시지</button>';
    html += '<button class="share-btn x" type="button" data-share="x">X</button>';
    html += '<button class="share-btn link" type="button" data-share="copy">링크 복사</button>';
    html += "</div></div>";

    html += '<p class="calc-disclaimer">지방세법의 세율·공정시장가액비율을 그대로 적용한 <strong>간이 계산</strong>입니다. 과세표준상한제(전년 과표 대비 0~5% 상한)와 지역자원시설세는 반영하지 않았고, 지자체 조례로 세율이 조정된 곳은 다를 수 있습니다. 실제 금액은 7월 고지서나 위택스에서 확인하세요.</p>';

    box.innerHTML = html;
    box.hidden = false;
    if (window.gtag) gtag("event", "tool_result", { tool_path: location.pathname });

    var url = "https://blog.importants-studio.com/tools/property-tax-calculator/";
    var shareText = "공시가격 " + won(r.price) + " 집이면 재산세가 연 " + won(r.total) + " 정도라고 합니다 (혜택줍줍 계산기)";
    box.querySelectorAll("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-share");
        if (mode === "native") {
          if (navigator.share) navigator.share({ title: "재산세 계산기", text: shareText, url: url }).catch(function () {});
          else copyTo(btn, shareText + "\n" + url, "복사됨 (카톡에 붙여넣기)");
        } else if (mode === "x") {
          window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText) + "&url=" + encodeURIComponent(url), "_blank", "noopener");
        } else copyTo(btn, url, "링크 복사됨");
      });
    });
    function copyTo(btn, text, done) {
      var o = btn.textContent;
      navigator.clipboard.writeText(text).then(function () { btn.textContent = done; setTimeout(function () { btn.textContent = o; }, 2000); });
    }
    if (box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ── 입력 ──────────────────────────────────────────────────

  function num(el) { var v = parseInt(String(el.value).replace(/[,\s원]/g, ""), 10); return isNaN(v) || v < 0 ? 0 : v; }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("property-tax-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var share = parseInt(form.elements.share.value, 10);
      if (isNaN(share) || share <= 0 || share > 100) share = 100;
      render(calculate({
        price: num(form.elements.price),
        oneHome: form.elements.oneHome.value === "yes",
        urban: form.elements.urban.checked,
        lastYear: num(form.elements.lastYear),
        share: share,
      }));
    });
  });

  window.__propertyTax = { calculate: calculate, FMV_ONE_HOME: FMV_ONE_HOME, RATE_ONE_HOME: RATE_ONE_HOME, RATE_STD: RATE_STD };
})();
