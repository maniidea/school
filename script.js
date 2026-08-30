// Google Apps Script Deployment URL:
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwPowYYAt-wymsUIom14Jwb70nBV6Oj6OppYyOKsS6Rja8sFUHyzXzUcgoRCIW_p6DpHw/exec";   

let currentUser = null;
let masterCurriculum = [];
let masterQuestions = [];
let masterUserScores = [];
let teacherStudentScores = [];
let principalDashboardData = { scores: [], teachers: [], students: [] };

// Quiz Engine States
let activeQuizList = [];
let currentQIndex = 0;
let userScore = 0;
let perQuestionTime = 20;
let timeRemaining = 0;
let timerInterval = null;
let autoNextTimeout = null;
let isAnswered = false;
let extractedAiBatch = [];

const GLOBAL_STANDARDS = ["5", "6", "7", "8", "9", "10", "11", "12"];   
const GLOBAL_SUBJECTS = ["Science", "Maths", "Social Science", "English", "Tamil", "Botany", "Zoology", "Physics", "Chemistry"];   

function initApp() {
  const savedUser = localStorage.getItem("hmsUser");
  if (savedUser) {
    try { currentUser = JSON.parse(savedUser); } catch(e) { currentUser = null; }
  }

  populateAllDropdowns();
  updateAuthUI();
  loadPortalData();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function populateAllDropdowns() {
  const signupStd = document.getElementById("signupStd");
  if (signupStd) {
    signupStd.innerHTML = GLOBAL_STANDARDS.map(s => `<option value="${s}">Class ${s}</option>`).join("");
  }

  // Filter play standard dropdown based on the user's allowed scope
  const playStd = document.getElementById("playStdSelect");
  if (playStd) {
    let allowed = GLOBAL_STANDARDS;
    if (currentUser) {
      if (currentUser.role === "student") {
        allowed = (currentUser.standards && currentUser.standards.length > 0) ? currentUser.standards : ["5"];
      } else if (currentUser.role === "aspirant" || currentUser.role === "principal") {
        allowed = GLOBAL_STANDARDS;
      } else if (currentUser.role === "teacher") {
        allowed = (currentUser.standards && currentUser.standards.length > 0) ? currentUser.standards : GLOBAL_STANDARDS;
      }
    }
    playStd.innerHTML = allowed.map(s => `<option value="${s}">Class ${s}</option>`).join("");
    syncPlaySubjects();
  }

  const authStd = document.getElementById("authorStdSelect");
  if (authStd) {
    const allowedStds = (currentUser && currentUser.standards && currentUser.standards.length > 0) ? currentUser.standards : GLOBAL_STANDARDS;
    authStd.innerHTML = allowedStds.map(s => `<option value="${s}">Class ${s}</option>`).join("");
    syncAuthorSubjects();
  }

  ["manageStdFilter", "repStdFilter", "tchRepStdFilter", "prFilterStd"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">All Standards</option>' + GLOBAL_STANDARDS.map(s => `<option value="${s}">Class ${s}</option>`).join("");
  });

  ["manageSubFilter", "repSubFilter", "tchRepSubFilter", "prFilterSub"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">All Subjects</option>' + GLOBAL_SUBJECTS.map(s => `<option value="${s}">${s}</option>`).join("");
  });
}

async function loadPortalData() {
  try {
    const url = `${SCRIPT_URL}?action=getInitialData${currentUser ? '&userId=' + encodeURIComponent(currentUser.id) : ''}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.success) {
      if (data.curriculum) masterCurriculum = data.curriculum;
      if (data.questions) masterQuestions = data.questions;
      if (data.user) {
        currentUser = data.user;
        localStorage.setItem("hmsUser", JSON.stringify(currentUser));
      }
      populateAllDropdowns();
    }
  } catch (err) {
    console.warn("Using offline defaults:", err);
  }
}

function updateAuthUI() {
  const guestBanner = document.getElementById("guestBanner");
  const playCountInput = document.getElementById("playCountInput");
  const playAllCheckbox = document.getElementById("playAllCheckbox");
  const userBadge = document.getElementById("userBadge");
  const btnOpenLogin = document.getElementById("btnOpenLogin");
  const btnOpenSignup = document.getElementById("btnOpenSignup");
  const btnLogout = document.getElementById("btnLogout");
  const playScopeNotice = document.getElementById("playScopeNotice");

  if (currentUser) {
    if (guestBanner) guestBanner.classList.add("hidden");
    if (playCountInput) playCountInput.max = 100;
    if (playAllCheckbox) playAllCheckbox.disabled = false;

    if (btnOpenLogin) btnOpenLogin.classList.add("hidden");
    if (btnOpenSignup) btnOpenSignup.classList.add("hidden");
    if (btnLogout) btnLogout.classList.remove("hidden");
    if (userBadge) {
      userBadge.classList.remove("hidden");
      let scope = `Class ${currentUser.standards.join(", ")}`;
      if (currentUser.role === "principal") scope = "Master School Control";
      else if (currentUser.role === "aspirant") scope = "TNPSC / UPSC Aspirant (Classes 5-12)";
      else if (currentUser.role === "teacher") scope = `Assigned Classes: [${currentUser.standards.join(",")}], Subjects: [${currentUser.subjects.join(",")}]`;
      userBadge.innerText = `${currentUser.name} (${currentUser.role.toUpperCase()}) | ${scope}`;
    }

    if (playScopeNotice) {
      if (currentUser.role === "student") {
        playScopeNotice.innerText = `Attending Class ${currentUser.standards.join(", ")} Assessments. (Contact Principal to adjust class access)`;
      } else if (currentUser.role === "aspirant") {
        playScopeNotice.innerText = `TNPSC / UPSC Aspirant Mode: Access to All Classes (5 to 12) and Subjects.`;
      } else {
        playScopeNotice.innerText = `Select your Class, Subject, Unit/Chapter, and Topic to begin.`;
      }
    }

    if (currentUser.role === "principal") {
      document.querySelectorAll(".principal-only").forEach(el => el.classList.remove("hidden"));
      document.querySelectorAll(".teacher-principal-only").forEach(el => el.classList.remove("hidden"));
    } else if (currentUser.role === "teacher") {
      document.querySelectorAll(".teacher-only").forEach(el => el.classList.remove("hidden"));
      document.querySelectorAll(".teacher-principal-only").forEach(el => el.classList.remove("hidden"));
    }
    
    const tabScores = document.getElementById("tabMyScores");
    if (tabScores) tabScores.classList.remove("hidden");
  } else {
    if (guestBanner) guestBanner.classList.remove("hidden");
    if (playCountInput) {
      playCountInput.value = Math.min(parseInt(playCountInput.value, 10) || 5, 10);
      playCountInput.max = 10;
    }
    if (playAllCheckbox) {
      playAllCheckbox.checked = false;
      playAllCheckbox.disabled = true;
    }

    if (btnOpenLogin) btnOpenLogin.classList.remove("hidden");
    if (btnOpenSignup) btnOpenSignup.classList.remove("hidden");
    if (btnLogout) btnLogout.classList.add("hidden");
    if (userBadge) userBadge.classList.add("hidden");

    if (playScopeNotice) {
      playScopeNotice.innerText = `Select your Class, Subject, Unit/Chapter, and Topic to begin.`;
    }

    document.querySelectorAll(".teacher-principal-only, .teacher-only, .principal-only").forEach(el => el.classList.add("hidden"));
    const tabScores = document.getElementById("tabMyScores");
    if (tabScores) tabScores.classList.add("hidden");
  }

  populateAllDropdowns();
}

function toggleSignupCategory(val) {
  const stdGroup = document.getElementById("signupStdGroup");
  if (stdGroup) {
    if (val === "aspirant") {
      stdGroup.classList.add("hidden");
    } else {
      stdGroup.classList.remove("hidden");
    }
  }
}

function syncPlaySubjects() {
  const playStd = document.getElementById("playStdSelect");
  const subSelect = document.getElementById("playSubSelect");
  if (!playStd || !subSelect) return;

  const std = playStd.value || "5";
  const available = [...new Set(masterQuestions.filter(q => q.standard === std).map(q => q.subject))];
  const list = available.length > 0 ? available : GLOBAL_SUBJECTS;
  subSelect.innerHTML = list.map(s => `<option value="${s}">${s}</option>`).join("");
  syncPlayChapters();
}

function syncPlayChapters() {
  const playStd = document.getElementById("playStdSelect");
  const subSelect = document.getElementById("playSubSelect");
  const chapSelect = document.getElementById("playChapterSelect");
  if (!playStd || !subSelect || !chapSelect) return;

  const std = playStd.value || "5";
  const sub = (subSelect.value || "Science").toLowerCase();

  const chapters = [...new Set(masterQuestions.filter(q => q.standard === std && (q.subject || '').toLowerCase() === sub).map(q => q.chapter))];
  chapSelect.innerHTML = '<option value="All">All Units / Chapters</option>' + chapters.map(c => `<option value="${c}">${c}</option>`).join("");
  syncPlayTopics();
}

function syncPlayTopics() {
  const playStd = document.getElementById("playStdSelect");
  const subSelect = document.getElementById("playSubSelect");
  const chapSelect = document.getElementById("playChapterSelect");
  const topicSelect = document.getElementById("playTopicSelect");
  if (!playStd || !subSelect || !chapSelect || !topicSelect) return;

  const std = playStd.value || "5";
  const sub = (subSelect.value || "Science").toLowerCase();
  const chap = chapSelect.value || "All";

  let filtered = masterQuestions.filter(q => q.standard === std && (q.subject || '').toLowerCase() === sub);
  if (chap !== "All") filtered = filtered.filter(q => q.chapter === chap);

  const topics = [...new Set(filtered.map(q => q.topic))];
  topicSelect.innerHTML = '<option value="All">All Topics</option>' + topics.map(t => `<option value="${t}">${t}</option>`).join("");
}

function syncAuthorSubjects() {
  const subSelect = document.getElementById("authorSubSelect");
  if (!subSelect) return;
  const allowedSubs = (currentUser && currentUser.subjects && currentUser.subjects.length > 0 && !currentUser.subjects.includes("All")) ? currentUser.subjects : GLOBAL_SUBJECTS;
  subSelect.innerHTML = allowedSubs.map(s => `<option value="${s}">${s}</option>`).join("");
  syncAuthorChapters();
}

function syncAuthorChapters() {
  const authStd = document.getElementById("authorStdSelect");
  const subSelect = document.getElementById("authorSubSelect");
  const datalist = document.getElementById("chapterSuggestions");
  if (!authStd || !subSelect || !datalist) return;

  const std = authStd.value;
  const sub = subSelect.value.toLowerCase();
  const matched = masterCurriculum.filter(c => c.standard === std && (c.subject || '').toLowerCase() === sub);
  datalist.innerHTML = matched.map(c => `<option value="${c.chapter}">`).join("");
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

async function handleSignIn() {
  const userId = document.getElementById("loginUserId").value.trim();
  const pass = document.getElementById("loginPassword").value.trim();
  if (!userId || !pass) return alert("Please enter User ID and Password.");

  const payload = { action: "loginUser", userId, password: pass };
  try {
    const data = await callAppsScript(payload);
    if (data && data.success) {
      currentUser = data.user;
      localStorage.setItem("hmsUser", JSON.stringify(currentUser));
      closeModal("loginModal");
      document.getElementById("loginUserId").value = "";
      document.getElementById("loginPassword").value = "";
      await loadPortalData();
      updateAuthUI();
      alert(`Welcome, ${currentUser.name}!`);
    } else {
      alert("Sign In failed: " + (data ? data.error : "Unknown error"));
    }
  } catch (err) {
    alert("Connection error: " + err.message);
  }
}

async function handleSignUp() {
  const userType = document.getElementById("signupUserType").value;
  const userId = document.getElementById("signupUserId").value.trim();
  const name = document.getElementById("signupName").value.trim();
  const pass = document.getElementById("signupPassword").value.trim();
  const std = document.getElementById("signupStd").value;

  if (!userId || !name || !pass) return alert("Please complete all registration fields.");

  const payload = {
    action: "registerUser",
    userType: userType,
    userId: userId,
    name: name,
    password: pass,
    standard: (userType === "aspirant") ? "5,6,7,8,9,10,11,12" : std
  };

  try {
    const data = await callAppsScript(payload);
    if (data && data.success) {
      currentUser = data.user;
      localStorage.setItem("hmsUser", JSON.stringify(currentUser));
      closeModal("signupModal");
      document.getElementById("signupUserId").value = "";
      document.getElementById("signupName").value = "";
      document.getElementById("signupPassword").value = "";
      await loadPortalData();
      updateAuthUI();
      alert(`Account created! Welcome, ${currentUser.name}!`);
    } else {
      alert("Registration failed: " + (data ? data.error : "Unknown error"));
    }
  } catch (err) {
    alert("Connection error: " + err.message);
  }
}

function logout() {
  localStorage.removeItem("hmsUser");
  currentUser = null;
  location.reload();
}

function switchTab(tab, eventTarget) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  ["playTab", "createTab", "manageTab", "reportsTab", "teacherScoresTab", "principalTab"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  if (eventTarget) eventTarget.classList.add("active");

  if (tab === "play") {
    document.getElementById("playTab").classList.remove("hidden");
    resetQuizView();
  }
  if (tab === "create") document.getElementById("createTab").classList.remove("hidden");
  if (tab === "manage") {
    document.getElementById("manageTab").classList.remove("hidden");
    renderManageTable();
  }
  if (tab === "reports") {
    document.getElementById("reportsTab").classList.remove("hidden");
    loadUserReports();
  }
  if (tab === "teacherScores") {
    document.getElementById("teacherScoresTab").classList.remove("hidden");
    loadTeacherStudentScores();
  }
  if (tab === "principal") {
    document.getElementById("principalTab").classList.remove("hidden");
    loadPrincipalDashboard();
  }
}

function resetQuizView() {
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);
  document.getElementById("quizSetupCard").classList.remove("hidden");
  document.getElementById("quizActiveCard").classList.add("hidden");
  document.getElementById("quizResultCard").classList.add("hidden");
}

function toggleSelectAll(isAll) {
  if (!currentUser) return;
  const countInput = document.getElementById("playCountInput");
  countInput.disabled = isAll;
  countInput.style.background = isAll ? "#e9ecef" : "#fff";
}

async function startQuiz() {
  const std = document.getElementById("playStdSelect").value;
  const sub = document.getElementById("playSubSelect").value.toLowerCase();
  const chap = document.getElementById("playChapterSelect").value;
  const topic = document.getElementById("playTopicSelect").value;
  const isAll = currentUser && document.getElementById("playAllCheckbox").checked;
  
  let count = parseInt(document.getElementById("playCountInput").value, 10) || 5;
  if (!currentUser && count > 10) count = 10;

  perQuestionTime = Number(document.getElementById("playTimerSelect").value);

  let matched = masterQuestions.filter(q => {
    const mStd = q.standard === std;
    const mSub = (q.subject || '').toLowerCase() === sub;
    const mChap = (chap === "All" || q.chapter === chap);
    const mTopic = (topic === "All" || q.topic === topic);
    return mStd && mSub && mChap && mTopic;
  });

  if (matched.length === 0) {
    return alert(`No questions found for Class ${std} - ${sub.toUpperCase()} (${chap}). Please author questions or pick another topic.`);
  }

  matched.sort(() => Math.random() - 0.5);
  if (!isAll) matched = matched.slice(0, Math.min(count, matched.length));

  activeQuizList = matched;
  currentQIndex = 0;
  userScore = 0;

  document.getElementById("quizSetupCard").classList.add("hidden");
  document.getElementById("quizResultCard").classList.add("hidden");
  document.getElementById("quizActiveCard").classList.remove("hidden");

  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);
  isAnswered = false;

  const total = activeQuizList.length;
  const q = activeQuizList[currentQIndex];

  document.getElementById("quizProgressBadge").innerText = `Question ${currentQIndex + 1} of ${total} | [${q.chapter}]`;
  document.getElementById("btnNextQuestion").innerText = (currentQIndex === total - 1) ? "Submit Test 🏁" : "Next Question ⏩";

  const area = document.getElementById("singleQuestionArea");
  area.innerHTML = `
    <h3 style="margin-top:0; font-size:1.15rem;">${q.question}</h3>
    <div class="options-grid">
      <button class="opt-btn" onclick="selectAnswer(1, this)">A. ${q.optA}</button>
      <button class="opt-btn" onclick="selectAnswer(2, this)">B. ${q.optB}</button>
      <button class="opt-btn" onclick="selectAnswer(3, this)">C. ${q.optC}</button>
      <button class="opt-btn" onclick="selectAnswer(4, this)">D. ${q.optD}</button>
    </div>
  `;

  const timerBadge = document.getElementById("timerContainer");
  const track = document.getElementById("timerBarTrack");
  const fill = document.getElementById("timerBarFill");

  if (perQuestionTime > 0) {
    timerBadge.classList.remove("hidden");
    track.classList.remove("hidden");
    timeRemaining = perQuestionTime;
    document.getElementById("timerText").innerText = `${timeRemaining}s`;
    fill.style.width = "100%";

    timerInterval = setInterval(() => {
      timeRemaining--;
      document.getElementById("timerText").innerText = `${timeRemaining}s`;
      fill.style.width = `${(timeRemaining / perQuestionTime) * 100}%`;

      if (timeRemaining <= 5) timerBadge.classList.add("danger");
      else timerBadge.classList.remove("danger");

      if (timeRemaining <= 0) {
        clearInterval(timerInterval);
        handleTimeUp();
      }
    }, 1000);
  } else {
    timerBadge.classList.add("hidden");
    track.classList.add("hidden");
  }
}

function selectAnswer(opt, btn) {
  if (isAnswered) return;
  isAnswered = true;
  clearInterval(timerInterval);

  const q = activeQuizList[currentQIndex];
  const correct = Number(q.correctOpt);
  const buttons = btn.parentElement.querySelectorAll(".opt-btn");
  buttons.forEach(b => b.disabled = true);

  if (opt === correct) {
    btn.classList.add("correct");
    userScore++;
  } else {
    btn.classList.add("wrong");
    if (buttons[correct - 1]) buttons[correct - 1].classList.add("correct");
  }

  if (perQuestionTime > 0) {
    autoNextTimeout = setTimeout(() => nextQuestion(true), 1800);
  }
}

function handleTimeUp() {
  if (isAnswered) return;
  isAnswered = true;

  const q = activeQuizList[currentQIndex];
  const correct = Number(q.correctOpt);
  const buttons = document.querySelectorAll("#singleQuestionArea .opt-btn");
  buttons.forEach(b => b.disabled = true);
  if (buttons[correct - 1]) buttons[correct - 1].classList.add("correct");

  const area = document.getElementById("singleQuestionArea");
  const tip = document.createElement("div");
  tip.style.color = "#c62828";
  tip.style.fontWeight = "bold";
  tip.style.marginTop = "10px";
  tip.innerText = "⏰ Time's up! Advancing...";
  area.appendChild(tip);

  autoNextTimeout = setTimeout(() => nextQuestion(true), 2000);
}

function nextQuestion(auto) {
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);

  if (currentQIndex < activeQuizList.length - 1) {
    currentQIndex++;
    renderCurrentQuestion();
  } else {
    finishQuiz();
  }
}

async function finishQuiz() {
  clearInterval(timerInterval);
  clearTimeout(autoNextTimeout);

  document.getElementById("quizActiveCard").classList.add("hidden");
  document.getElementById("quizResultCard").classList.remove("hidden");

  const total = activeQuizList.length;
  const pct = Math.round((userScore / total) * 100);
  document.getElementById("resultScoreDisplay").innerText = `${userScore} / ${total} (${pct}%)`;

  let msg = "Sign up or sign in to save permanent score history!";
  if (currentUser) {
    if (pct === 100) msg = "🌟 Perfect score at Hari Mandir School!";
    else if (pct >= 80) msg = "🎉 Excellent grasp of this topic!";
    else msg = "Keep revising to improve your understanding!";
  }
  document.getElementById("resultFeedback").innerText = msg;

  const payload = {
    action: "saveScore",
    userId: currentUser ? currentUser.id : "GUEST",
    userName: currentUser ? currentUser.name : "Guest Student",
    standard: document.getElementById("playStdSelect").value,
    subject: document.getElementById("playSubSelect").value,
    chapter: document.getElementById("playChapterSelect").value,
    topic: document.getElementById("playTopicSelect").value,
    score: userScore,
    total: total
  };

  try { await callAppsScript(payload); } catch (e) { console.warn("Score submission note:", e); }
}

function switchCreateMethod(method) {
  document.getElementById("btnMethodManual").className = method === 'manual' ? 'btn btn-primary flex-1' : 'btn btn-outline-dark flex-1';
  document.getElementById("btnMethodAi").className = method === 'ai' ? 'btn btn-secondary flex-1' : 'btn btn-outline-dark flex-1';
  document.getElementById("sectionManualCreate").classList.toggle("hidden", method !== 'manual');
  document.getElementById("sectionAiCreate").classList.toggle("hidden", method !== 'ai');
}

async function publishManualQuestion() {
  if (!currentUser) return alert("Please sign in as Teacher or Principal.");

  const std = document.getElementById("authorStdSelect").value;
  const sub = document.getElementById("authorSubSelect").value;
  const chap = document.getElementById("authorChapterInput").value.trim() || "Unit 1: General";
  const topic = document.getElementById("authorTopicInput").value.trim() || "Overview";

  const q = document.getElementById("manualQuestionText").value.trim();
  const optA = document.getElementById("manualOptA").value.trim();
  const optB = document.getElementById("manualOptB").value.trim();
  const optC = document.getElementById("manualOptC").value.trim();
  const optD = document.getElementById("manualOptD").value.trim();
  const correct = Number(document.getElementById("manualCorrectOpt").value);

  if (!q || !optA || !optB || !optC || !optD) return alert("Please fill all question details.");

  const payload = {
    action: "saveSingleQuestion",
    userId: currentUser.id,
    role: currentUser.role,
    standard: std,
    subject: sub,
    chapter: chap,
    topic: topic,
    question: q,
    optA, optB, optC, optD,
    correctOpt: correct
  };

  const data = await callAppsScript(payload);
  if (data && data.success) {
    alert("✅ Question successfully saved to Question Bank!");
    document.getElementById("manualQuestionText").value = "";
    document.getElementById("manualOptA").value = "";
    document.getElementById("manualOptB").value = "";
    document.getElementById("manualOptC").value = "";
    document.getElementById("manualOptD").value = "";
    await loadPortalData();
  }
}

async function extractTextFromPDF(file) {
  if (typeof pdfjsLib === "undefined") throw new Error("PDF.js library is not loaded.");
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += ` [Page ${i}] ` + textContent.items.map(item => item.str).join(" ") + "\n";
  }
  return fullText;
}

async function callAppsScript(payload) {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function generateViaAI() {
  const fileInput = document.getElementById("aiFileInput");
  const file = fileInput.files[0];
  if (!file) return alert("Please select a PDF or Image file first.");

  const countInput = document.getElementById("aiQuestionCount");
  let requestedTotal = parseInt(countInput.value, 10);
  if (!requestedTotal || requestedTotal <= 0) requestedTotal = 10;
  if (requestedTotal > 100) requestedTotal = 100;

  const btnExtract = document.getElementById("btnExtractAi");
  const progressArea = document.getElementById("aiBatchProgressArea");
  const statusText = document.getElementById("aiBatchStatusText");
  const progressPct = document.getElementById("aiBatchProgressPct");
  const progressBar = document.getElementById("aiBatchProgressBar");
  const previewArea = document.getElementById("aiPreviewArea");

  btnExtract.disabled = true;
  progressArea.classList.remove("hidden");
  previewArea.classList.add("hidden");
  extractedAiBatch = [];

  const context = {
    standard: document.getElementById("authorStdSelect").value,
    subject: document.getElementById("authorSubSelect").value,
    chapter: document.getElementById("authorChapterInput").value.trim() || "Unit 1",
    topic: document.getElementById("authorTopicInput").value.trim() || "General"
  };

  try {
    let payloadData = "";
    let isText = false;

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      statusText.innerText = "Extracting text from PDF...";
      payloadData = await extractTextFromPDF(file);
      isText = true;
      if (!payloadData || payloadData.trim().length < 20) {
        throw new Error("No readable text found in PDF (it might be a scanned image).");
      }
    } else {
      statusText.innerText = "Reading image data...";
      payloadData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      isText = false;
    }

    const CHUNK_SIZE = 15;
    const totalBatches = Math.ceil(requestedTotal / CHUNK_SIZE);
    let questionsCollected = [];
    let lastError = "";

    for (let batch = 1; batch <= totalBatches; batch++) {
      const remainingNeeded = requestedTotal - questionsCollected.length;
      const currentBatchCount = Math.min(CHUNK_SIZE, remainingNeeded);
      if (currentBatchCount <= 0) break;

      const currentPct = Math.round(((batch - 1) / totalBatches) * 100);
      statusText.innerText = `Extracting Batch ${batch} of ${totalBatches} (${questionsCollected.length}/${requestedTotal} ready)...`;
      progressPct.innerText = `${currentPct}%`;
      progressBar.style.width = `${currentPct}%`;

      let batchPayload = payloadData;
      if (isText && payloadData.length > 6000) {
        const sliceSize = Math.floor(payloadData.length / totalBatches);
        const start = (batch - 1) * sliceSize;
        batchPayload = payloadData.substring(start, start + sliceSize + 2000);
      }

      const data = await callAppsScript({
        action: "parseDocument",
        fileData: batchPayload,
        isText: isText,
        count: currentBatchCount,
        contextInfo: context
      });

      if (data && data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        questionsCollected = questionsCollected.concat(data.questions);
      } else {
        lastError = (data && data.error) ? data.error : "Batch failed";
      }

      if (batch < totalBatches) {
        statusText.innerText = `Pacing next batch...`;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    progressBar.style.width = "100%";
    progressPct.innerText = "100%";
    btnExtract.disabled = false;

    if (questionsCollected.length > 0) {
      statusText.innerText = `Generated ${questionsCollected.length} questions successfully!`;
      extractedAiBatch = questionsCollected.slice(0, requestedTotal);
      document.getElementById("aiTotalCountBadge").innerText = extractedAiBatch.length;
      renderAiPreview(extractedAiBatch);
      previewArea.classList.remove("hidden");
    } else {
      progressArea.classList.add("hidden");
      alert("Error generating questions:\n" + lastError);
    }
  } catch (err) {
    btnExtract.disabled = false;
    progressArea.classList.add("hidden");
    alert("Extraction notice: " + err.message);
  }
}

function renderAiPreview(questions) {
  const container = document.getElementById("aiPreviewList");
  container.innerHTML = "";
  questions.forEach((q, idx) => {
    const item = document.createElement("div");
    item.style.padding = "8px 0";
    item.style.borderBottom = "1px solid #e9ecef";
    item.innerHTML = `
      <div style="font-weight:600;">${idx + 1}. ${q.question}</div>
      <div style="font-size:0.85rem; color:#555;">A) ${q.optA} | B) ${q.optB} | C) ${q.optC} | D) ${q.optD}</div>
      <div style="font-size:0.85rem; color:var(--accent); font-weight:bold;">Correct: Option ${q.correctOpt}</div>
    `;
    container.appendChild(item);
  });
}

async function publishAiBatch() {
  const payload = {
    action: "saveBatchQuestions",
    userId: currentUser.id,
    role: currentUser.role,
    standard: document.getElementById("authorStdSelect").value,
    subject: document.getElementById("authorSubSelect").value,
    chapter: document.getElementById("authorChapterInput").value.trim() || "Unit 1",
    topic: document.getElementById("authorTopicInput").value.trim() || "General",
    questions: extractedAiBatch
  };

  const data = await callAppsScript(payload);
  if (data && data.success) {
    alert(`✅ Published ${data.count} questions to Question Bank!`);
    document.getElementById("aiPreviewArea").classList.add("hidden");
    document.getElementById("aiBatchProgressArea").classList.add("hidden");
    await loadPortalData();
  }
}

function renderManageTable() {
  const tbody = document.getElementById("manageTableBody");
  tbody.innerHTML = "";

  const search = document.getElementById("manageSearchInput").value.toLowerCase();
  const std = document.getElementById("manageStdFilter").value;
  const sub = document.getElementById("manageSubFilter").value.toLowerCase();

  const isPrincipal = currentUser && (currentUser.role === "principal");
  const myId = currentUser ? currentUser.id.toLowerCase() : "";

  const filtered = masterQuestions.filter(q => {
    const isOwner = (q.creatorId.toLowerCase() === myId);
    if (!isPrincipal && !isOwner) return false;

    const mSearch = !search || q.question.toLowerCase().includes(search);
    const mStd = !std || q.standard === std;
    const mSub = !sub || q.subject.toLowerCase() === sub;
    return mSearch && mStd && mSub;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No questions found.</td></tr>`;
    return;
  }

  filtered.forEach(q => {
    tbody.innerHTML += `
      <tr>
        <td><strong>Class ${q.standard}</strong></td>
        <td>${q.subject}</td>
        <td><small><strong>${q.chapter}</strong><br>${q.topic}</small></td>
        <td>
          <div style="font-weight:600;">${q.question}</div>
          <small>A) ${q.optA} | B) ${q.optB} | C) ${q.optC} | D) ${q.optD}</small><br>
          <small style="color:var(--accent); font-weight:bold;">Correct: Option ${q.correctOpt}</small>
        </td>
        <td><code>${q.creatorId}</code> (${q.creatorRole})</td>
        <td><button class="btn btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteQuestion('${q.id}')">🗑️ Delete</button></td>
      </tr>
    `;
  });
}

async function deleteQuestion(id) {
  if (!confirm("Are you sure you want to remove this question?")) return;
  const data = await callAppsScript({ action: "deleteQuestion", questionId: id, userId: currentUser.id });
  if (data && data.success) {
    alert("Question deleted.");
    await loadPortalData();
    renderManageTable();
  } else {
    alert(data ? data.error : "Failed to delete question");
  }
}

async function loadUserReports() {
  if (!currentUser) return;
  const tbody = document.getElementById("userScoresTbody");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Loading scores...</td></tr>`;

  try {
    const res = await fetch(`${SCRIPT_URL}?action=getUserScores&userId=${encodeURIComponent(currentUser.id)}`);
    const data = await res.json();
    if (data && data.success) {
      masterUserScores = data.scores || [];
      filterUserReports();
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error: ${e.message}</td></tr>`;
  }
}

function filterUserReports() {
  const from = document.getElementById("repFromDate").value;
  const to = document.getElementById("repToDate").value;
  const std = document.getElementById("repStdFilter").value;
  const sub = document.getElementById("repSubFilter").value.toLowerCase();

  const filtered = masterUserScores.filter(s => {
    let sDate = s.date;
    if (s.date && s.date.includes("T")) sDate = s.date.split("T")[0];

    const mFrom = !from || sDate >= from;
    const mTo = !to || sDate <= to;
    const mStd = !std || s.standard === std;
    const mSub = !sub || s.subject.toLowerCase() === sub;
    return mFrom && mTo && mStd && mSub;
  });

  const tbody = document.getElementById("userScoresTbody");
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No scores found.</td></tr>`;
    document.getElementById("repStatTotal").innerText = "0";
    document.getElementById("repStatAvg").innerText = "0%";
    return;
  }

  let totalPct = 0;
  filtered.forEach(s => {
    const pct = Math.round((Number(s.score) / Number(s.total)) * 100);
    totalPct += pct;
    tbody.innerHTML += `
      <tr>
        <td>${s.date}</td>
        <td>Class ${s.standard}</td>
        <td>${s.subject}</td>
        <td>${s.chapter} - ${s.topic}</td>
        <td>${s.score} / ${s.total}</td>
        <td><strong>${pct}%</strong></td>
      </tr>
    `;
  });

  document.getElementById("repStatTotal").innerText = filtered.length;
  document.getElementById("repStatAvg").innerText = `${Math.round(totalPct / filtered.length)}%`;
}

async function loadTeacherStudentScores() {
  if (!currentUser) return;
  const tbody = document.getElementById("teacherStudentScoresTbody");
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Loading assigned class scores...</td></tr>`;

  try {
    const res = await fetch(`${SCRIPT_URL}?action=getTeacherStudentScores&userId=${encodeURIComponent(currentUser.id)}`);
    const data = await res.json();
    if (data && data.success) {
      teacherStudentScores = data.scores || [];
      filterTeacherStudentScores();
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${e.message}</td></tr>`;
  }
}

function filterTeacherStudentScores() {
  const search = document.getElementById("tchRepSearchStudent").value.toLowerCase();
  const std = document.getElementById("tchRepStdFilter").value;
  const sub = document.getElementById("tchRepSubFilter").value.toLowerCase();

  const tbody = document.getElementById("teacherStudentScoresTbody");
  tbody.innerHTML = "";

  const filtered = (teacherStudentScores || []).filter(s => {
    const mStudent = !search || s.userId.toLowerCase().includes(search) || s.userName.toLowerCase().includes(search);
    const mStd = !std || s.standard === std;
    const mSub = !sub || s.subject.toLowerCase() === sub;
    return mStudent && mStd && mSub;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No student performance records found for your assigned classes.</td></tr>`;
    return;
  }

  filtered.forEach(s => {
    const pct = Math.round((Number(s.score) / Number(s.total)) * 100);
    tbody.innerHTML += `
      <tr>
        <td><strong>${s.userId}</strong></td>
        <td>${s.userName}</td>
        <td>Class ${s.standard}</td>
        <td>${s.subject}</td>
        <td>${s.chapter} - ${s.topic}</td>
        <td><strong>${s.score} / ${s.total} (${pct}%)</strong></td>
        <td>${s.date}</td>
      </tr>
    `;
  });
}

async function loadPrincipalDashboard() {
  const res = await fetch(`${SCRIPT_URL}?action=getPrincipalDashboard&userId=${encodeURIComponent(currentUser.id)}`);
  const data = await res.json();
  if (data && data.success) {
    principalDashboardData = data;
    renderPrincipalTeacherTable();
    renderPrincipalStudentTable();
    filterPrincipalScores();
  }
}

function renderPrincipalTeacherTable() {
  const tbody = document.getElementById("principalTeacherTbody");
  tbody.innerHTML = "";

  (principalDashboardData.teachers || []).forEach(t => {
    const stdBoxes = GLOBAL_STANDARDS.map(s => `
      <label style="font-size:0.8rem; margin-right:6px; cursor:pointer;">
        <input type="checkbox" value="${s}" ${t.standards.includes(s) ? 'checked' : ''} onchange="toggleTeacherStd('${t.id}', '${s}', this.checked)"> ${s}
      </label>
    `).join("");   

    const subBoxes = GLOBAL_SUBJECTS.map(s => `
      <label style="font-size:0.8rem; margin-right:6px; cursor:pointer;">
        <input type="checkbox" value="${s}" ${t.subjects.includes(s) ? 'checked' : ''} onchange="toggleTeacherSub('${t.id}', '${s}', this.checked)"> ${s}
      </label>
    `).join("");   

    tbody.innerHTML += `
      <tr>
        <td><strong>${t.id}</strong></td>
        <td>${t.name}</td>
        <td>${stdBoxes}</td>
        <td>${subBoxes}</td>
        <td><button class="btn btn-outline-dark" style="padding:4px 8px; font-size:0.8rem;" onclick="saveTeacherPermissions('${t.id}')">💾 Save</button></td>
      </tr>
    `;
  });
}

function toggleTeacherStd(tId, std, checked) {
  const teacher = principalDashboardData.teachers.find(t => t.id === tId);
  if (!teacher) return;
  if (checked) { if (!teacher.standards.includes(std)) teacher.standards.push(std); }
  else { teacher.standards = teacher.standards.filter(s => s !== std); }
}

function toggleTeacherSub(tId, sub, checked) {
  const teacher = principalDashboardData.teachers.find(t => t.id === tId);
  if (!teacher) return;
  if (checked) { if (!teacher.subjects.includes(sub)) teacher.subjects.push(sub); }
  else { teacher.subjects = teacher.subjects.filter(s => s !== sub); }
}

async function saveTeacherPermissions(teacherId) {
  const teacher = principalDashboardData.teachers.find(t => t.id === teacherId);
  const payload = {
    action: "updateTeacherPermissions",
    principalId: currentUser.id,
    targetTeacherId: teacherId,
    standards: teacher.standards,
    subjects: teacher.subjects
  };
  const data = await callAppsScript(payload);
  if (data && data.success) alert(`✅ Permissions updated for Teacher: ${teacher.name}`);
  else alert("Error: " + (data ? data.error : "Could not update permissions"));
}

function renderPrincipalStudentTable() {
  const tbody = document.getElementById("principalStudentTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const studentList = principalDashboardData.students || [];
  if (studentList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No registered students yet.</td></tr>`;
    return;
  }

  studentList.forEach(s => {
    const stdBoxes = GLOBAL_STANDARDS.map(std => `
      <label style="font-size:0.8rem; margin-right:6px; cursor:pointer;">
        <input type="checkbox" value="${std}" ${s.standards.includes(std) ? 'checked' : ''} onchange="toggleStudentStd('${s.id}', '${std}', this.checked)"> ${std}
      </label>
    `).join("");   

    tbody.innerHTML += `
      <tr>
        <td><strong>${s.id}</strong></td>
        <td>${s.name}</td>
        <td><span class="badge" style="background:${s.role === 'aspirant' ? 'var(--secondary)' : 'var(--primary)'}; color:#fff;">${s.role.toUpperCase()}</span></td>
        <td>${stdBoxes}</td>
        <td><button class="btn btn-outline-dark" style="padding:4px 8px; font-size:0.8rem;" onclick="saveStudentPermissions('${s.id}')">💾 Save Classes</button></td>
      </tr>
    `;
  });
}

function toggleStudentStd(sId, std, checked) {
  const student = (principalDashboardData.students || []).find(s => s.id === sId);
  if (!student) return;
  if (checked) { if (!student.standards.includes(std)) student.standards.push(std); }
  else { student.standards = student.standards.filter(s => s !== std); }
}

async function saveStudentPermissions(studentId) {
  const student = (principalDashboardData.students || []).find(s => s.id === studentId);
  if (!student) return;
  const payload = {
    action: "updateStudentPermissions",
    principalId: currentUser.id,
    targetStudentId: studentId,
    standards: student.standards
  };
  const data = await callAppsScript(payload);
  if (data && data.success) alert(`✅ Classes updated for Student: ${student.name}`);
  else alert("Error: " + (data ? data.error : "Could not update permissions"));
}

async function principalCreateTeacher() {
  const id = document.getElementById("newTeacherId").value.trim();
  const name = document.getElementById("newTeacherName").value.trim();
  const pass = document.getElementById("newTeacherPass").value.trim();

  if (!id || !name || !pass) return alert("Enter Teacher ID, Name, and Password.");

  const payload = {
    action: "createTeacher",
    principalId: currentUser.id,
    teacherId: id,
    teacherName: name,
    password: pass,
    standards: ["5"],
    subjects: ["Science"]
  };

  const data = await callAppsScript(payload);
  if (data && data.success) {
    alert(`Teacher ${name} created with password!`);
    document.getElementById("newTeacherId").value = "";
    document.getElementById("newTeacherName").value = "";
    document.getElementById("newTeacherPass").value = "";
    loadPrincipalDashboard();
  } else {
    alert("Error: " + (data ? data.error : "Could not create teacher"));
  }
}

function filterPrincipalScores() {
  const search = document.getElementById("prFilterStudent").value.toLowerCase();
  const std = document.getElementById("prFilterStd").value;
  const sub = document.getElementById("prFilterSub").value.toLowerCase();

  const tbody = document.getElementById("principalScoresTbody");
  tbody.innerHTML = "";

  const filtered = (principalDashboardData.scores || []).filter(s => {
    const mStudent = !search || s.userId.toLowerCase().includes(search) || s.userName.toLowerCase().includes(search);
    const mStd = !std || s.standard === std;
    const mSub = !sub || s.subject.toLowerCase() === sub;
    return mStudent && mStd && mSub;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No matching student scores found.</td></tr>`;
    return;
  }

  filtered.forEach(s => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${s.userId}</strong></td>
        <td>${s.userName}</td>
        <td>Class ${s.standard}</td>
        <td>${s.subject}</td>
        <td>${s.chapter} - ${s.topic}</td>
        <td><strong>${s.score} / ${s.total}</strong></td>
        <td>${s.date}</td>
      </tr>
    `;
  });
}