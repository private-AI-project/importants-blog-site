// 실업급여 수급 자격 판정기.
//
// 실업급여 계산기는 넘친다. 그런데 전부 "얼마"만 계산하고 "받을 수 있나"는
// 안 본다. 이직사유를 묻지도 않고 하단에 "실제 수급자격은 고용센터가
// 결정합니다"라고 적어 놓는다. 자진퇴사한 사람에게 200만원을 보여준다.
//
// 사람들의 진짜 질문은 자격이다. 그래서 자격을 먼저 판정하고 금액을 붙인다.
//
// 근거: 고용보험법 제40조·제50조, 별표 1(소정급여일수),
//       고용보험법 시행규칙 별표 2(수급자격이 제한되지 않는 정당한 이직 사유)

(function () {
  "use strict";

  // ── 기준값 (2026년) ────────────────────────────────────────

  var DAILY_CAP = 68100;              // 1일 상한액
  var MIN_WAGE_HOUR = 10320;          // 2026년 최저임금
  var MIN_RATE = 0.8;                 // 하한액은 최저임금의 80%
  var BENEFIT_RATE = 0.6;             // 평균임금의 60%
  var REQUIRED_DAYS = 180;            // 이직 전 18개월간 피보험단위기간
  var SENIOR_AGE = 50;

  // 소정급여일수. 고용보험법 별표 1.
  var DURATION = [
    { under: 1,   young: 120, senior: 120, label: "1년 미만" },
    { under: 3,   young: 150, senior: 180, label: "1년 이상 3년 미만" },
    { under: 5,   young: 180, senior: 210, label: "3년 이상 5년 미만" },
    { under: 10,  young: 210, senior: 240, label: "5년 이상 10년 미만" },
    { under: 999, young: 240, senior: 270, label: "10년 이상" },
  ];

  // 이직사유별 판정.
  //   ok      자격 있음
  //   proof   정당한 사유지만 입증이 필요함
  //   no      자격 없음
  var REASONS = {
    layoff: {
      verdict: "ok", label: "권고사직·해고·계약만료·폐업",
      note: "회사 사정으로 그만둔 경우라 자격이 인정되는 것이 보통입니다",
    },
    retire: {
      verdict: "ok", label: "정년 도달",
      note: "정년으로 더 일할 수 없게 된 경우라 자진퇴사로 보지 않습니다",
    },
    wage: {
      verdict: "proof", label: "자진퇴사 · 임금체불",
      note: "이직 전 1년 안에 2개월 이상 임금이 체불됐거나 지연 지급된 경우입니다",
      proof: "급여명세서와 통장 거래내역으로 체불 기간을 증명하세요. 노동청 진정 접수 기록이 있으면 확실합니다",
    },
    commute: {
      verdict: "proof", label: "자진퇴사 · 통근 왕복 3시간 이상",
      note: "사업장 이전, 전근, 결혼으로 인한 주소 이전 등으로 통근이 곤란해진 경우입니다",
      proof: "출근 첨두시간대(오전 7~9시) 지도앱 경로 화면을 캡처하고, 주민등록초본과 인사발령장을 함께 준비하세요",
    },
    health: {
      verdict: "proof", label: "자진퇴사 · 질병·부상으로 업무 수행 곤란",
      note: "몸이 아파서 그만둔 것만으로는 안 되고, 회사가 휴직이나 배치전환을 안 해줬어야 합니다",
      proof: "의사 소견서와 함께, 회사에 휴직·직무전환을 요청했으나 거부됐다는 확인서가 필요합니다",
    },
    harassment: {
      verdict: "proof", label: "자진퇴사 · 직장 내 괴롭힘·성희롱·차별",
      note: "괴롭힘, 성희롱, 성별·종교·신체조건 등에 따른 차별을 겪은 경우입니다",
      proof: "사내 신고 기록, 노동청 진정, 동료 진술 등 객관적 자료를 모으세요",
    },
    family: {
      verdict: "proof", label: "자진퇴사 · 가족 간병 (30일 이상)",
      note: "부모나 동거 친족의 질병·부상으로 30일 이상 간호가 필요한 경우입니다",
      proof: "진단서와 함께, 회사가 휴가나 휴직을 안 내줬다는 사실을 확인받으세요",
    },
    restructure: {
      verdict: "proof", label: "자진퇴사 · 사업 축소에 따른 희망퇴직",
      note: "인원 감축이 예정된 상황에서 희망퇴직한 경우 인정됩니다",
      proof: "희망퇴직 공고문이나 경영상 사유를 확인할 수 있는 문서를 준비하세요",
    },
    personal: {
      verdict: "no", label: "자진퇴사 · 개인 사정",
      note: "이직, 창업, 학업, 단순 불만 등 개인 사정에 따른 자진퇴사는 자격이 인정되지 않습니다",
    },
    misconduct: {
      verdict: "no", label: "중대한 귀책사유로 해고",
      note: "횡령, 기밀 누설, 정당한 사유 없는 장기 무단결근 등으로 해고된 경우는 제외됩니다",
    },
  };

  // ── 계산 ──────────────────────────────────────────────────

  function durationRow(years, senior) {
    for (var i = 0; i < DURATION.length; i += 1) {
      if (years < DURATION[i].under) return DURATION[i];
    }
    return DURATION[DURATION.length - 1];
  }

  // 하한액은 1일 소정근로시간에 비례한다. 상한액은 시간과 무관하게 고정이다.
  // 단시간 근로자가 여기서 크게 갈리는데 대부분의 계산기가 8시간만 쓴다.
  function floorAmount(hours) {
    return Math.round(MIN_WAGE_HOUR * MIN_RATE * hours);
  }

  function calculate(i) {
    var reason = REASONS[i.reason];
    var daysOk = i.insuredDays >= REQUIRED_DAYS;
    var reasonOk = reason.verdict !== "no";
    var eligible = daysOk && reasonOk;

    // 1일 평균임금. 실제로는 퇴직 전 3개월의 임금총액을 그 기간 총일수로
    // 나누는데, 달마다 28~31일이라 값이 흔들린다. 30일로 잡아 근사한다.
    var avgDaily = i.monthlyWage / 30;
    var raw = avgDaily * BENEFIT_RATE;

    var floor = floorAmount(i.workHours);
    var daily = raw, capped = null;
    if (raw > DAILY_CAP) { daily = DAILY_CAP; capped = "상한"; }
    else if (raw < floor) { daily = floor; capped = "하한"; }
    daily = Math.round(daily);

    var senior = i.age >= SENIOR_AGE || i.disabled;
    var row = durationRow(i.insuredYears, senior);
    var days = senior ? row.senior : row.young;

    return {
      reason: reason,
      insuredDays: i.insuredDays,
      daysOk: daysOk,
      shortBy: Math.max(0, REQUIRED_DAYS - i.insuredDays),
      reasonOk: reasonOk,
      eligible: eligible,
      needsProof: reason.verdict === "proof",
      avgDaily: avgDaily,
      raw: raw,
      daily: daily,
      floor: floor,
      capped: capped,
      workHours: i.workHours,
      senior: senior,
      age: i.age,
      disabled: i.disabled,
      band: row.label,
      days: days,
      total: daily * days,
      months: Math.round(days / 30 * 10) / 10,
    };
  }

  // ── 화면 ──────────────────────────────────────────────────

  function won(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }

  function row(state, title, detail) {
    return '<li class="' + state + '"><strong>' + title + "</strong>" +
           (detail ? "<span>" + detail + "</span>" : "") + "</li>";
  }

  function render(r) {
    var box = document.getElementById("calc-result");
    var html = "";

    if (!r.eligible) {
      html += '<p class="calc-label">' + r.reason.label + "</p>";
      html += '<p class="calc-amount none">받기 어려울 가능성이 높습니다</p>';
      html += '<p class="calc-sub">아래에서 걸린 항목을 보세요</p>';
    } else if (r.needsProof) {
      html += '<p class="calc-label">자진퇴사지만 정당한 사유에 해당할 수 있습니다</p>';
      html += '<p class="calc-amount">월 약 ' + won(r.daily * 30) + "</p>";
      html += '<p class="calc-sub">' + r.days + "일 동안 · 총 " + won(r.total) + " 안팎 · <strong>입증자료가 필요합니다</strong></p>";
    } else {
      html += '<p class="calc-label">' + r.reason.label + "</p>";
      html += '<p class="calc-amount">월 약 ' + won(r.daily * 30) + "</p>";
      html += '<p class="calc-sub">' + r.days + "일 동안 · 총 " + won(r.total) + " 안팎</p>";
    }

    // 자격을 먼저, 금액은 그다음. 순서를 바꾸면 자격이 없는 사람이
    // 금액만 보고 착각한다.
    html += '<ul class="calc-checklist">';
    html += row(r.reasonOk ? (r.needsProof ? "warn" : "pass") : "fail",
      "이직사유 · " + r.reason.label, r.reason.note);
    html += row(r.daysOk ? "pass" : "fail",
      "피보험단위기간 " + r.insuredDays + "일",
      r.daysOk ? "이직 전 18개월간 180일 이상입니다"
               : "180일에서 " + r.shortBy + "일 모자랍니다. 이 요건은 사유와 상관없이 반드시 채워야 합니다");
    html += "</ul>";

    if (r.eligible) {
      html += '<div class="calc-breakdown"><h4>금액이 나온 과정</h4><ul>';
      html += '<li><span class="bd-label">1일 평균임금</span><span class="bd-value">' + won(r.avgDaily) +
              '</span><span class="bd-note">월 급여를 30으로 나눈 근사값입니다</span></li>';
      html += '<li><span class="bd-label">×60%</span><span class="bd-value">' + won(r.raw) + "</span></li>";
      if (r.capped === "상한") {
        html += '<li><span class="bd-label">상한 적용</span><span class="bd-value">' + won(DAILY_CAP) +
                '</span><span class="bd-note">2026년 1일 상한액입니다. 월급이 더 올라도 여기서 막힙니다</span></li>';
      } else if (r.capped === "하한") {
        html += '<li><span class="bd-label">하한 적용</span><span class="bd-value">' + won(r.floor) +
                '</span><span class="bd-note">최저임금 ' + won(MIN_WAGE_HOUR) + " × 80% × " + r.workHours +
                "시간입니다</span></li>";
      }
      html += '<li><span class="bd-label">소정급여일수</span><span class="bd-value">' + r.days +
              '일</span><span class="bd-note">' + (r.senior ? "50세 이상·장애인" : "50세 미만") + " · 가입기간 " + r.band + "</span></li>";
      html += '<li><span class="bd-label">총 수급액</span><span class="bd-value"><strong>' + won(r.total) +
              '</strong></span><span class="bd-note">약 ' + r.months + "개월치입니다</span></li>";
      html += "</ul></div>";
    }

    html += '<ul class="calc-notes">';
    if (r.needsProof && r.reason.proof) {
      html += "<li><strong>준비하실 것:</strong> " + r.reason.proof + "</li>";
    }
    if (!r.daysOk) {
      html += "<li>피보험단위기간은 재직일수가 아니라 <strong>보수를 받은 날</strong>입니다. 주5일 근무라면 주휴일이 더해져 주 6일로 잡힙니다. 이전 직장 기간도 이직 전 18개월 안이면 합산되니 고용보험 가입이력을 확인해 보세요</li>";
    }
    if (r.eligible && r.capped === "상한") {
      html += "<li>월급이 아무리 많아도 1일 " + won(DAILY_CAP) + " 에서 막힙니다. 2026년에 7년 만에 상한과 하한이 함께 올랐습니다</li>";
    }
    if (r.eligible && r.capped === "하한" && r.workHours < 8) {
      html += "<li>하한액은 1일 소정근로시간에 비례합니다. " + r.workHours + "시간 근무라 8시간 기준 " +
              won(floorAmount(8)) + " 이 아니라 " + won(r.floor) + " 입니다</li>";
    }
    if (r.eligible && !r.senior && r.age >= 45) {
      html += "<li>이직일 기준 만 50세가 되면 소정급여일수가 늘어납니다. 지금은 " + r.days + "일이지만 50세 이상이면 " +
              durationRow(0, true).senior + "일부터 최대 270일까지 갑니다</li>";
    }
    html += "<li>퇴직 다음 날부터 <strong>12개월 안</strong>에 받아야 합니다. 늦게 신청하면 남은 날짜만큼만 받고 끝납니다. 퇴사하면 바로 신청하세요</li>";
    html += "<li>실업 상태여야 하고 재취업 활동을 해야 계속 나옵니다. 신청만 해두고 구직활동을 안 하면 끊깁니다</li>";
    html += "</ul>";

    html += '<div class="calc-actions">';
    html += '<a class="calc-btn primary" href="https://www.work24.go.kr" target="_blank" rel="noopener">고용24에서 신청하기</a>';
    html += "</div>";

    html += '<div class="calc-share">';
    html += '<span class="calc-share-label">결과 공유하기</span>';
    html += '<div class="calc-share-btns">';
    html += '<button class="share-btn kakao" type="button" data-share="native">카카오톡·메시지</button>';
    html += '<button class="share-btn x" type="button" data-share="x">X</button>';
    html += '<button class="share-btn link" type="button" data-share="copy">링크 복사</button>';
    html += "</div></div>";

    html += '<p class="calc-disclaimer">고용보험법 별표 1과 시행규칙 별표 2를 반영한 <strong>간이 판정</strong>입니다. 수급자격은 최종적으로 고용센터가 개별 사정을 보고 결정합니다. 특히 자진퇴사의 정당한 사유는 같은 사정이라도 입증 정도에 따라 갈립니다. 1일 평균임금은 월 급여를 30으로 나눈 근사값이라 실제와 몇 천원 차이가 날 수 있습니다. 정확한 판단은 고용노동부 1350이나 거주지 고용센터에서 받으세요.</p>';

    box.innerHTML = html;
    box.hidden = false;

    var url = "https://blog.importants-studio.com/tools/unemployment-eligibility/";
    var shareText = r.eligible
      ? "실업급여 " + r.days + "일 동안 총 " + won(r.total) + " 정도라고 합니다 (혜택줍줍 판정기)"
      : "이 경우엔 실업급여를 받기 어려울 것 같다고 합니다 (혜택줍줍 판정기)";

    box.querySelectorAll("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-share");
        if (mode === "native") {
          if (navigator.share) {
            navigator.share({ title: "실업급여 수급 자격 판정기", text: shareText, url: url }).catch(function () {});
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

    if (box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ── 입력 ──────────────────────────────────────────────────

  function num(el) {
    if (!el) return 0;
    var v = parseInt(String(el.value).replace(/[,\s원]/g, ""), 10);
    return isNaN(v) || v < 0 ? 0 : v;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("unemployment-form");
    if (!form) return;

    // 피보험단위기간을 일 단위로 아는 사람은 드물다. 근무 개월 수에서
    // 짐작해 채워주고, 아는 사람은 직접 고칠 수 있게 둔다.
    var months = form.elements.workedMonths;
    var days = form.elements.insuredDays;
    var touched = false;
    days.addEventListener("input", function () { touched = true; });
    months.addEventListener("input", function () {
      if (touched) return;
      var m = parseFloat(months.value);
      if (!isNaN(m) && m > 0) days.value = Math.round(m * 26);   // 주5일이면 주휴 포함 주 6일
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      render(calculate({
        reason: form.elements.reason.value,
        insuredDays: num(days),
        insuredYears: parseFloat(form.elements.insuredYears.value) || 0,
        age: parseInt(form.elements.age.value, 10) || 0,
        disabled: form.elements.disabled.checked,
        monthlyWage: num(form.elements.monthlyWage),
        workHours: parseInt(form.elements.workHours.value, 10) || 8,
      }));
    });
  });

  window.__unemployment = {
    calculate: calculate, floorAmount: floorAmount, durationRow: durationRow,
    DAILY_CAP: DAILY_CAP, REQUIRED_DAYS: REQUIRED_DAYS, DURATION: DURATION, REASONS: REASONS,
  };
})();
