// 본인부담상한제 초과금 예상 환급액 계산기
// 기준: 2025년 진료분(2026년 8월 지급) 본인부담상한액. 근거: 복지부·건보공단 2026-08-30 보도자료
// (content/posts/2026-08-31-medical-cost-cap-refund.md 표 그대로 사용, 추정치 없음)
// 산정 방식: 본인부담금 합계 − 소득분위별 상한액. 실제 합산 항목(비급여 제외 등)에 따라 달라질 수 있어 "간이 계산"임.

(function () {
  "use strict";

  // 분위별 상한액(만원). 요양병원 120일 초과 입원 시 longTerm 값 적용.
  // 출처: 보건복지부·국민건강보험공단 2026-08-30 보도자료 (2025년도 기준표)
  var CAP_TABLE = {
    b1:    { label: "1분위 (소득 하위 10%)", normal: 89,  longTerm: 141 },
    b2_3:  { label: "2~3분위",               normal: 110, longTerm: 178 },
    b4_5:  { label: "4~5분위",               normal: 170, longTerm: 240 },
    b6_7:  { label: "6~7분위",               normal: 320, longTerm: 396 },
    b8:    { label: "8분위",                 normal: 437, longTerm: 569 },
    b9:    { label: "9분위",                 normal: 525, longTerm: 684 },
    b10:   { label: "10분위 (소득 상위 10%)", normal: 826, longTerm: 1074 }
  };

  function calculate(input) {
    var t = CAP_TABLE[input.tier];
    var cap = input.longTerm ? t.longTerm : t.normal;
    var amount = input.paid - cap;

    var result = { label: t.label, cap: cap, notes: [] };
    result.notes.push("본인부담금 합계에는 비급여 진료비·2~3인실 상급병실료 차액·임플란트 등은 포함되지 않습니다. 이런 항목을 넣어 계산했다면 실제 환급액은 더 적을 수 있습니다.");
    if (input.longTerm) {
      result.notes.push("요양병원 120일 초과 입원 상한액(" + cap.toLocaleString() + "만원)을 적용했습니다.");
    }

    if (amount <= 0) {
      result.amount = 0;
      result.reason = t.label + " 상한액 " + cap.toLocaleString() + "만원을 넘지 않아 환급 대상이 아닐 가능성이 높습니다.";
      return result;
    }

    result.amount = amount;
    return result;
  }

  // 범위로 제시 (간이 계산임을 반영해 ±10%)
  function toRange(v) {
    if (v <= 0) return null;
    var low = Math.max(0, Math.round(v * 0.9 / 5) * 5);
    var high = Math.max(low + 5, Math.round(v * 1.1 / 5) * 5);
    return { low: low, high: high };
  }

  function render(result) {
    var box = document.getElementById("calc-result");
    var html = "";

    if (result.amount <= 0) {
      html += '<p class="calc-amount none">환급 대상이 아닐 가능성이 높습니다</p>';
      html += '<p class="calc-reason">' + result.reason + "</p>";
    } else {
      var range = toRange(result.amount);
      html += '<p class="calc-label">' + result.label + " 예상 환급액</p>";
      html += '<p class="calc-amount">약 ' + range.low + "만~" + range.high + "만원</p>";
    }

    if (result.notes.length) {
      html += '<ul class="calc-notes">';
      result.notes.forEach(function (n) { html += "<li>" + n + "</li>"; });
      html += "</ul>";
    }

    html += '<div class="calc-actions">';
    html += '<a class="calc-btn primary" href="https://www.nhis.or.kr" target="_blank" rel="noopener">건보공단에서 정확한 금액 확인</a>';
    html += "</div>";
    html += '<div class="calc-share">';
    html += '<span class="calc-share-label">결과 공유하기</span>';
    html += '<div class="calc-share-btns">';
    html += '<button class="share-btn kakao" type="button" data-share="native">카카오톡·메시지</button>';
    html += '<button class="share-btn x" type="button" data-share="x">X</button>';
    html += '<button class="share-btn link" type="button" data-share="copy">링크 복사</button>';
    html += "</div></div>";
    html += '<p class="calc-disclaimer">이 계산기는 복지부·건보공단이 공개한 2025년도 상한액 기준을 단순화한 <strong>간이 모의계산</strong>입니다. 실제 환급액은 본인부담금 합산 항목에 따라 달라지며, 확정 금액은 건보공단 환급금 조회·신청 메뉴에서 확인하세요.</p>';

    box.innerHTML = html;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "center" });

    var url = "https://blog.importants-studio.com/tools/medical-refund-calculator/";
    var summary = result.amount > 0
      ? "작년 병원비 예상 환급액이 약 " + toRange(result.amount).low + "만~" + toRange(result.amount).high + "만원이래요"
      : "본인부담상한제 환급 대상인지 계산기로 확인해봤어요";
    var shareText = summary + " (혜택줍줍 간이계산기)";

    box.querySelectorAll("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-share");
        if (mode === "native") {
          if (navigator.share) {
            navigator.share({ title: "병원비 환급액 계산기", text: shareText, url: url }).catch(function () {});
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
    var form = document.getElementById("medical-refund-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = {
        tier: form.elements.tier.value,
        paid: parseFloat(form.elements.paid.value) || 0,
        longTerm: form.elements.longTerm.value === "yes"
      };
      render(calculate(input));
    });
  });

  // 테스트용 노출
  window.__medicalRefundCalc = { calculate: calculate, CAP_TABLE: CAP_TABLE };
})();
