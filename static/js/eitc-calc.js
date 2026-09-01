// 근로장려금 예상 계산기
// 기준: 2026년(2025년 귀속) 국세청 안내. 근거 데이터는 blog 글에서 교차 검증.
// 산정 방식은 국세청 공식 산정표를 구간 근사한 "간이 계산"이며, 정확한 금액은 홈택스 조회가 기준.

(function () {
  "use strict";

  // 가구 유형별: 소득 상한, 최대 지급액, 최대 지급 구간(점증 종료~점감 시작)
  var TABLE = {
    single:  { label: "단독가구",   limit: 2200, max: 165, plateauFrom: 400, plateauTo: 900 },
    single_earner: { label: "홑벌이가구", limit: 3200, max: 285, plateauFrom: 700, plateauTo: 1400 },
    dual:    { label: "맞벌이가구", limit: 4400, max: 330, plateauFrom: 800, plateauTo: 1700 }
  };

  var ASSET_HALF = 17000;   // 만원. 1.7억 이상이면 50% 감액
  var ASSET_LIMIT = 24000;  // 만원. 2.4억 이상이면 대상 제외
  var LATE_RATE = 0.95;     // 기한 후 신청은 95%
  var SEMI_RATE = 0.35;     // 반기신청은 12월에 산정액의 35% 선지급

  function baseAmount(type, income) {
    var t = TABLE[type];
    if (income >= t.limit) return 0;
    if (income <= 0) return 0;
    if (income < t.plateauFrom) {
      // 점증 구간: 소득에 비례해 증가
      return t.max * (income / t.plateauFrom);
    }
    if (income <= t.plateauTo) {
      return t.max;
    }
    // 점감 구간: 상한까지 선형 감소
    var ratio = (t.limit - income) / (t.limit - t.plateauTo);
    return t.max * ratio;
  }

  function calculate(input) {
    var t = TABLE[input.type];
    var result = { label: t.label, limit: t.limit, max: t.max, notes: [] };

    if (input.asset >= ASSET_LIMIT) {
      result.amount = 0;
      result.reason = "재산 합계가 2억 4천만원 이상이면 지급 대상에서 제외됩니다.";
      return result;
    }
    if (input.income >= t.limit) {
      result.amount = 0;
      result.reason = t.label + "는 연 총소득 " + t.limit.toLocaleString() + "만원 미만이어야 대상입니다.";
      return result;
    }

    var amount = baseAmount(input.type, input.income);

    if (input.asset >= ASSET_HALF) {
      amount = amount * 0.5;
      result.notes.push("재산이 1억 7천만원 이상이라 산정액의 50%만 반영했습니다.");
    }
    if (input.applyType === "late") {
      amount = amount * LATE_RATE;
      result.notes.push("기한 후 신청은 산정액의 95%가 지급됩니다.");
    }

    result.amount = amount;
    if (input.applyType === "semi") {
      result.semiAmount = amount * SEMI_RATE;
      result.notes.push("반기신청은 12월에 산정액의 35%를 먼저 받고, 나머지는 다음 해 정산 후 받습니다.");
    }
    return result;
  }

  // 범위로 제시 (간이 계산임을 반영해 ±10%)
  function toRange(v) {
    if (v <= 0) return null;
    var low = Math.max(0, Math.round(v * 0.9 / 5) * 5);
    var high = Math.round(v * 1.1 / 5) * 5;
    return { low: low, high: high };
  }

  function daysUntil(dateStr) {
    var target = new Date(dateStr + "T23:59:59+09:00");
    var now = new Date();
    return Math.ceil((target - now) / 86400000);
  }

  function render(result, input) {
    var box = document.getElementById("calc-result");
    var html = "";

    if (result.amount <= 0) {
      html += '<p class="calc-amount none">지급 대상이 아닐 가능성이 높습니다</p>';
      html += '<p class="calc-reason">' + result.reason + "</p>";
    } else {
      var range = toRange(result.amount);
      html += '<p class="calc-label">' + result.label + " 예상 근로장려금</p>";
      html += '<p class="calc-amount">약 ' + range.low + "만~" + range.high + "만원</p>";
      if (result.semiAmount) {
        var semi = toRange(result.semiAmount);
        html += '<p class="calc-sub">이 중 12월 선지급 예상: 약 ' + semi.low + "만~" + semi.high + "만원</p>";
      }
    }

    if (result.notes.length) {
      html += '<ul class="calc-notes">';
      result.notes.forEach(function (n) { html += "<li>" + n + "</li>"; });
      html += "</ul>";
    }

    // 신청 일정 안내 (접수 전 / 진행 중 / 마감 후를 구분)
    var schedules = {
      regular: { open: "2027-05-01", close: "2027-06-01", name: "정기신청" },
      semi: { open: "2026-09-01", close: "2026-09-15", name: "반기신청(상반기분)" },
      late: { open: "2026-06-02", close: "2026-12-01", name: "기한 후 신청" }
    };
    var sc = schedules[input.applyType];
    var toOpen = daysUntil(sc.open);
    var toClose = daysUntil(sc.close);
    var fmt = function (x) { return x.replace(/-/g, ".").replace(/^\d{4}\./, function (m) { return m; }); };

    if (toOpen > 0) {
      html += '<p class="calc-dday">' + sc.name + " 접수 시작: <strong>" + fmt(sc.open) + "</strong> (D-" + toOpen + ")</p>";
    } else if (toClose >= 0) {
      html += '<p class="calc-dday">' + sc.name + " 마감까지 <strong>D-" + toClose + "</strong> (" + fmt(sc.close) + "까지)</p>";
    } else {
      html += '<p class="calc-dday">' + sc.name + "은 " + fmt(sc.close) + "에 마감됐습니다.</p>";
    }

    html += '<div class="calc-actions">';
    html += '<a class="calc-btn primary" href="https://hometax.go.kr" target="_blank" rel="noopener">홈택스에서 정확한 금액 확인</a>';
    html += "</div>";
    html += '<div class="calc-share">';
    html += '<span class="calc-share-label">결과 공유하기</span>';
    html += '<div class="calc-share-btns">';
    html += '<button class="share-btn kakao" type="button" data-share="native">카카오톡·메시지</button>';
    html += '<button class="share-btn x" type="button" data-share="x">X</button>';
    html += '<button class="share-btn link" type="button" data-share="copy">링크 복사</button>';
    html += "</div></div>";
    html += '<p class="calc-disclaimer">이 계산기는 국세청 공개 기준을 단순화한 <strong>간이 모의계산</strong>입니다. 실제 지급액은 심사 결과에 따라 달라지며, 확정 금액은 홈택스 장려금 메뉴에서 확인하세요.</p>';

    box.innerHTML = html;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });

    var url = "https://blog.importants-studio.com/tools/eitc-calculator/";
    var summary = result.amount > 0
      ? "내 예상 근로장려금은 약 " + toRange(result.amount).low + "만~" + toRange(result.amount).high + "만원이래요"
      : "근로장려금 대상인지 계산기로 확인해봤어요";
    var shareText = summary + " (혜택줍줍 간이계산기)";

    box.querySelectorAll("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-share");
        if (mode === "native") {
          if (navigator.share) {
            navigator.share({ title: "근로장려금 계산기", text: shareText, url: url }).catch(function () {});
          } else {
            copyTo(btn, shareText + "\n" + url, "복사됨 (카톡에 붙여넣기)");
          }
        } else if (mode === "x") {
          window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText) + "&url=" + encodeURIComponent(url), "_blank", "noopener");
        } else {
          copyTo(btn, url, "링크 복사됨");
        }
      });
    });

    function copyTo(btn, text, done) {
      var original = btn.textContent;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = done;
        setTimeout(function () { btn.textContent = original; }, 2000);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("eitc-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = {
        type: form.elements.household.value,
        income: parseFloat(form.elements.income.value) || 0,
        asset: parseFloat(form.elements.asset.value) || 0,
        applyType: form.elements.applyType.value
      };
      render(calculate(input), input);
    });
  });

  // 테스트용 노출
  window.__eitcCalc = { calculate: calculate, TABLE: TABLE };
})();
