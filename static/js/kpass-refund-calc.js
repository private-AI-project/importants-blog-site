// 모두의카드(K-패스) 대중교통비 환급액 계산기.
//
// 정액제가 일반형인지 플러스형인지는 유리한 쪽으로 정해지는 게 아니라 타는
// 수단의 1회 요금으로 갈린다. 3천원 미만이면 일반형, GTX·신분당선·광역버스처럼
// 3천원 이상이 섞이면 플러스형이다. 그래서 수단을 입력으로 받는다.
//
// 처음에는 셋 중 큰 값을 주는 것으로 잡았는데, 국토교통부 사례(청년이 월 13만원
// 쓰면 8만 5천원)와 어긋났다. 그 사례는 광역버스와 GTX 를 타는 청년이라
// 플러스형이 적용된 값이었다. 큰 값을 고르면 일반형 10만 5천원이 나온다.
//
// 그 위에서 기본형(정률제)과 정액제 중 유리한 쪽은 제도가 자동으로 준다.
//
// 정률제는 시차시간대 이용분에 높은 환급률이 걸린다. 한 달 이용액 중 얼마가
// 그 시간대였는지는 사용자도 모르기 때문에, 전부 일반 시간대였을 때와 전부
// 시차시간대였을 때를 양 끝으로 잡아 범위로 낸다.
//
// 2026년 4~9월 한시 확대 기준이다. 상수는 아래 한 곳에 모았다.

(function () {
  "use strict";

  // ── 상수 ──────────────────────────────────────────────────

  // 근거: 국토교통부 대도시권광역교통위원회 발표 (2026년 4~9월 한시 확대)
  // https://www.korea.kr/news/policyNewsView.do?newsId=148962910
  //
  // base    기본형 정률제 환급률 (일반 시간대)
  // shift   기본형 정률제 환급률 (지정 시차시간대)
  // normal  정액제 일반형 기준금액 (수도권)
  // plus    정액제 플러스형 기준금액 (수도권)
  var TYPES = {
    general: { label: "일반",              base: 0.200, shift: 0.500, normal: 30000, plus: 50000 },
    youth:   { label: "청년·2자녀·어르신", base: 0.300, shift: 0.600, normal: 25000, plus: 45000 },
    multi:   { label: "3자녀 이상",        base: 0.500, shift: 0.800, normal: 22000, plus: 40000 },
    lowinc:  { label: "저소득층",          base: 0.533, shift: 0.833, normal: 22000, plus: 40000 },
  };

  // 둘째 달부터는 월 15회 이상 타야 환급이 나온다. 가입 첫 달은 예외다.
  var MIN_RIDES = 15;

  // 지정 시차시간대. 환급률이 30%p 올라간다.
  var SHIFT_HOURS = "오전 5시 30분~6시 30분, 오전 9시~10시, 오후 4시~5시, 오후 7시~8시";

  var MAX_SPEND = 3000000;   // 월 300만원. 실수로 0을 더 눌렀을 때를 막는다

  // ── 계산 ──────────────────────────────────────────────────

  function calculate(input) {
    var t = TYPES[input.type] || TYPES.general;
    var spend = input.spend;

    // 정률제는 이용액에 환급률을 곱한다. 시차시간대 비중을 모르니 양 끝을 잡는다.
    var rateLow = Math.floor(spend * t.base);
    var rateHigh = Math.floor(spend * t.shift);

    // 정액제는 기준금액을 넘긴 만큼 전액 돌려준다. 어느 형이 걸리는지는
    // 타는 수단으로 이미 정해져 있다.
    var isPlus = input.fare === "plus";
    var flatBase = isPlus ? t.plus : t.normal;
    var flat = Math.max(0, spend - flatBase);

    // 기본형과 정액제 중 유리한 쪽은 제도가 자동으로 준다. 정률제 쪽은
    // 시차시간대 비중을 모르니 양 끝을 잡아 범위로 낸다.
    var bestLow = Math.max(rateLow, flat);
    var bestHigh = Math.max(rateHigh, flat);

    return {
      type: t,
      spend: spend,
      rides: input.rides,
      eligible: input.rides >= MIN_RIDES || input.firstMonth,
      firstMonth: input.firstMonth,
      isPlus: isPlus,
      flatLabel: isPlus ? "플러스형" : "일반형",
      flatBase: flatBase,
      rateLow: rateLow, rateHigh: rateHigh,
      flat: flat,
      bestLow: bestLow, bestHigh: bestHigh,
      // 일반 시간대만 타도 정액제가 이기면 환급액이 이용액만으로 확정된다.
      winnerLow: flat === 0 && rateLow === 0 ? "환급액 없음"
                 : (flat >= rateLow ? (isPlus ? "플러스형" : "일반형") : "기본형(정률제)"),
      sameBoth: bestLow === bestHigh,
    };
  }

  // ── 화면 ──────────────────────────────────────────────────

  function won(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }
  function pct(r) { return (r * 100).toFixed(1).replace(/\.0$/, "") + "%"; }

  function render(r) {
    var box = document.getElementById("calc-result");
    var html = "";

    if (!r.eligible) {
      html += '<p class="calc-amount none">이번 달은 환급 대상이 아닙니다</p>';
      html += '<p class="calc-reason">둘째 달부터는 월 ' + MIN_RIDES +
              "회 이상 타야 환급이 나옵니다. 지금 " + r.rides + "회로 넣으셨습니다. " +
              "가입 첫 달이면 위에서 첫 달을 선택하세요.</p>";
    } else {
      html += '<p class="calc-label">' + r.type.label + " · 월 " + won(r.spend) + " 이용 시 환급액</p>";
      if (r.sameBoth) {
        html += '<p class="calc-amount">' + won(r.bestLow) + "</p>";
        html += '<p class="calc-sub">' + r.winnerLow + " 적용</p>";
      } else {
        html += '<p class="calc-amount">' + won(r.bestLow) + " ~ " + won(r.bestHigh) + "</p>";
        html += '<p class="calc-sub">시차시간대를 얼마나 타는지에 따라 이 사이에서 갈립니다</p>';
      }

      html += '<div class="calc-table-wrap"><table class="calc-table"><thead><tr>' +
              "<th>환급 방식</th><th>기준</th><th>환급액</th></tr></thead><tbody>";
      html += "<tr><td>기본형 (정률제)</td><td>일반 시간대 " + pct(r.type.base) +
              "</td><td>" + won(r.rateLow) + "</td></tr>";
      html += "<tr><td>기본형 (정률제)</td><td>시차시간대 " + pct(r.type.shift) +
              "</td><td>" + won(r.rateHigh) + "</td></tr>";
      html += "<tr><td>" + r.flatLabel + " (정액제)</td><td>기준 " + won(r.flatBase) +
              " 초과분</td><td>" + won(r.flat) + "</td></tr>";
      html += "</tbody></table></div>";

      html += '<ul class="calc-notes">';
      html += "<li>기본형과 " + r.flatLabel + " 중 <strong>유리한 쪽을 제도가 자동으로</strong> 적용합니다. 고르실 필요가 없습니다</li>";
      html += "<li>1회 요금이 3천원 미만인 수단만 타면 일반형, GTX·신분당선·광역버스처럼 3천원 이상이 섞이면 " +
              "플러스형으로 잡힙니다. 지금은 " + r.flatLabel + "으로 계산했습니다</li>";
      html += "<li>지정 시차시간대는 " + SHIFT_HOURS + "입니다</li>";
      html += "<li><strong>이 기준은 9월 이용분까지입니다.</strong> 10월 이용분부터는 기준금액과 환급률이 원래대로 돌아갈 예정입니다</li>";
      html += "</ul>";
    }

    html += '<div class="calc-actions">';
    html += '<a class="calc-btn primary" href="https://korea-pass.kr" target="_blank" rel="noopener">K-패스 공식 홈페이지에서 카드 등록</a>';
    html += "</div>";

    html += '<div class="calc-share">';
    html += '<span class="calc-share-label">결과 공유하기</span>';
    html += '<div class="calc-share-btns">';
    html += '<button class="share-btn kakao" type="button" data-share="native">카카오톡·메시지</button>';
    html += '<button class="share-btn x" type="button" data-share="x">X</button>';
    html += '<button class="share-btn link" type="button" data-share="copy">링크 복사</button>';
    html += "</div></div>";

    html += '<p class="calc-disclaimer">수도권 기준금액을 반영한 <strong>간이 계산</strong>입니다. 정액제 기준금액은 지역(수도권·지방·지원지역)마다 다르고 이용자 유형에 따라서도 갈립니다. 확정 환급액은 K-패스 공식 홈페이지나 앱에서 본인 실적으로 확인하세요.</p>';

    box.innerHTML = html;
    box.hidden = false;
    if (window.gtag) gtag("event", "tool_result", { tool_path: location.pathname });

    var url = "https://blog.importants-studio.com/tools/kpass-refund-calculator/";
    var shareText = r.eligible
      ? "모두의카드로 월 " + won(r.spend) + " 쓰면 " + won(r.bestLow) + " 환급이래요 (혜택줍줍 간이계산기)"
      : "모두의카드는 월 15회 이상 타야 환급이 나온대요 (혜택줍줍 간이계산기)";

    box.querySelectorAll("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-share");
        if (mode === "native") {
          if (navigator.share) {
            navigator.share({ title: "모두의카드 환급액 계산기", text: shareText, url: url }).catch(function () {});
          } else {
            copyTo(btn, shareText + "\n" + url, "복사됨 (카톡에 붙여넣기)");
          }
        } else if (mode === "x") {
          window.open(
            "https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText) + "&url=" + encodeURIComponent(url),
            "_blank", "noopener"
          );
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

    // 스크롤은 마지막에 한다. 위에 두면 이게 터질 때 공유 버튼 연결까지 같이 죽는다.
    if (box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("kpass-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var spend = parseInt(String(form.elements.spend.value).replace(/[,\s원]/g, ""), 10);
      if (!spend || spend < 1 || spend > MAX_SPEND) { form.elements.spend.select(); return; }
      var rides = parseInt(form.elements.rides.value, 10);
      if (isNaN(rides) || rides < 0) rides = 0;
      render(calculate({
        type: form.elements.type.value,
        spend: spend,
        rides: rides,
        fare: form.elements.fare.value,
        firstMonth: form.elements.firstMonth.value === "yes",
      }));
    });
  });

  window.__kpass = { calculate: calculate, TYPES: TYPES, MIN_RIDES: MIN_RIDES };
})();
