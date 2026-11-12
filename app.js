const API_KEY = 'AIzaSyB20VY7WRY-Bkq66mH5wau-tWOWEgYtv1E';   
const SPREADSHEET_ID = '1LsjCmsElzfQr2kJWn5JBeKVTh66bR7zxIOGZgqoFCAY';
const ONESIGNAL_APP_ID = '835a2543-5500-41c9-b1dc-59c9f2d37420';

const RANGE_GROUPS = "'Расписание'!E7:E";
const RANGE_TEACHER_LAST = "'Расписание'!I7:I";
const RANGE_TEACHER_FIRST = "'Расписание'!J7:J";
const RANGE_TEACHER_MIDDLE = "'Расписание'!K7:K";
const RANGE_SCHEDULE = "'Расписание'!A8:K"; 

function normalizeCell(str) {
    return String(str === undefined || str === null ? '' : str)
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let currentDate = new Date();
let currentType = '';
let currentName = '';
let cachedData = null; 
let allGroups = [];
let allTeachers = [];
let currentScreenId = 'screen-main';
let lastScreen = 'screen-main';

// ---- ИЗБРАННОЕ ----
function getFavorite() {
    try {
        const raw = localStorage.getItem('btt_favorite');
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function setFavorite(type, name) {
    try {
        if (type && name) localStorage.setItem('btt_favorite', JSON.stringify({ type, name }));
        else localStorage.removeItem('btt_favorite');
    } catch (e) {}
    updatePushTags();
}

function isFavorite(type, name) {
    const fav = getFavorite();
    return !!(fav && fav.type === type && fav.name === name);
}

function toggleFavoriteForCurrent() {
    if (!currentType || !currentName) return;
    if (isFavorite(currentType, currentName)) {
        setFavorite(null, null);
    } else {
        setFavorite(currentType, currentName);
    }
    updateFavoriteUI();
    updateSettingsUI();
}

function updateFavoriteUI() {
    const btn = document.getElementById('favorite-btn');
    if (!btn) return;
    const fav = isFavorite(currentType, currentName);
    btn.textContent = fav ? '⭐' : '☆';
    btn.title = fav ? 'Убрать из избранного' : 'Добавить в избранное';
}

// ---- ТЕМНАЯ ТЕМА ----
function getTheme() {
    try { return localStorage.getItem('btt_theme') || 'light'; }
    catch (e) { return 'light'; }
}

function setTheme(theme) {
    try { localStorage.setItem('btt_theme', theme); } catch (e) {}
    applyTheme(theme);
    updateSettingsUI();
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

function applySavedTheme() {
    applyTheme(getTheme());
}

// ---- СОХРАНЕНИЕ СОСТОЯНИЯ ----
function saveState() {
    try {
        localStorage.setItem('btt_state', JSON.stringify({
            type: currentType,
            name: currentName,
            date: currentDate.getTime(),
            screen: currentScreenId
        }));
    } catch (e) {}
}

function restoreState() {
    try {
        const raw = localStorage.getItem('btt_state');
        if (!raw) return;
        const st = JSON.parse(raw);
        if (st) {
            if (st.type && st.name) {
                currentType = st.type;
                currentName = st.name;
            }
            if (typeof st.date === 'number') currentDate = new Date(st.date);
            if (typeof st.screen === 'string') lastScreen = st.screen;
        }
    } catch (e) {}
}

window.onload = () => {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const mainDateEl = document.getElementById('current-date-main');
    if (mainDateEl) {
        mainDateEl.innerText = currentDate.toLocaleDateString('ru-RU', options);
    }
    
    loadStats();
    updateWeekUI();
    
    restoreState();
    applySavedTheme();
    updateSettingsUI();
    
    const screenToOpen = (lastScreen && document.getElementById(lastScreen)) ? lastScreen : 'screen-main';
    
    if (screenToOpen === 'screen-schedule' && currentType && currentName) {
        document.getElementById('schedule-type').innerText = currentType === 'group' ? 'Группа' : 'Преподаватель';
        document.getElementById('schedule-name').innerText = currentName;
        updateFavoriteUI();
        updateWeekUI();
        showScreen('screen-schedule');
        loadSchedule();
    } else if (screenToOpen === 'screen-groups') {
        showScreen('screen-groups');
        if (allGroups.length === 0) loadGroups();
    } else if (screenToOpen === 'screen-teachers') {
        showScreen('screen-teachers');
        if (allTeachers.length === 0) loadTeachers();
    } else if (screenToOpen === 'screen-settings') {
        showScreen('screen-settings');
    } else {
        showScreen('screen-main');
    }
};

// ---- ЭКРАН НАСТРОЕК ----
function showSettingsScreen() {
    showScreen('screen-settings');
    updateSettingsUI();
}

function updateSettingsUI() {
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.checked = getTheme() === 'dark';

    const notifToggle = document.getElementById('notif-toggle');
    if (notifToggle) notifToggle.checked = getNotificationsEnabled();

    const list = document.getElementById('favorites-list');
    if (list) {
        const fav = getFavorite();
        if (fav && fav.type && fav.name) {
            list.innerHTML = '<li onclick="openSchedule(\'' + fav.type + '\', document.getElementById(\'fav-name\').value)">' +
                '<span>⭐ ' + escapeHtml(fav.name) + '</span>' +
                '<input type="hidden" id="fav-name" value="' + escapeHtml(fav.name) + '">' +
                '<button class="btn-remove" onclick="event.stopPropagation(); removeFavorite()">✕</button>' +
                '</li>';
        } else {
            list.innerHTML = '<li class="empty">Нет избранного. Откройте расписание и нажмите ☆</li>';
        }
    }
}

function removeFavorite() {
    setFavorite(null, null);
    updateSettingsUI();
    updateFavoriteUI();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(id);
    if (targetScreen) targetScreen.classList.add('active');
    
    currentScreenId = id;
    lastScreen = id;
    saveState();
    
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = 'flex';

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    if (id === 'screen-main' && navItems.item(0)) navItems.item(0).classList.add('active');
    if (id === 'screen-schedule' && navItems.item(1)) navItems.item(1).classList.add('active');
    if (id === 'screen-settings' && navItems.item(2)) navItems.item(2).classList.add('active');
    
    if (id === 'screen-groups' && allGroups.length === 0) loadGroups();
    if (id === 'screen-teachers' && allTeachers.length === 0) loadTeachers();
    if (id === 'screen-settings') updateSettingsUI();
}

async function fetchSheet(range) {
    const cacheKey = 'btt_cache_' + range;
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Ошибка сети: ' + response.status);
        
        const data = await response.json();
        const values = (data.values || []).map(row => 
            row.map(cell => (cell === undefined || cell === null) ? "" : cell)
        );
        
        localStorage.setItem(cacheKey, JSON.stringify(values));
        return values;

    } catch (error) {
        console.warn("Нет интернета, загружаем из кэша...", error);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        } else {
            throw new Error('Нет интернета и нет сохраненных данных');
        }
    }
}

async function loadStats() {
    try {
        showLoader(true);
        const groupsData = await fetchSheet(RANGE_GROUPS);
        const last = await fetchSheet(RANGE_TEACHER_LAST);
        const first = await fetchSheet(RANGE_TEACHER_FIRST);
        const middle = await fetchSheet(RANGE_TEACHER_MIDDLE);

        const uniqueGroups = new Set(groupsData.map(r => r.at(0)).filter(g => g && g.length > 2 && g !== '- -'));
        document.getElementById('stats-groups').innerText = uniqueGroups.size;

        const uniqueTeachers = new Set();
        for (let i = 0; i < last.length; i++) {
            let l = last.at(i) ? last.at(i).at(0) : '';
            let f = first.at(i) ? first.at(i).at(0) : '';
            let m = middle.at(i) ? middle.at(i).at(0) : '';
            let full = (l + ' ' + f + ' ' + m).replace(/\s+/g, ' ').trim();
            if (full && full !== '- - -') uniqueTeachers.add(full);
        }
        document.getElementById('stats-teachers').innerText = uniqueTeachers.size;
        
        let now = new Date();
        let dateStr = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU');
        document.getElementById('last-update').innerText = 'Последнее обновление: ' + dateStr;

    } catch (e) { 
        console.error(e); 
        document.getElementById('stats-groups').innerText = '?';
        document.getElementById('stats-teachers').innerText = '?';
    } finally {
        showLoader(false);
    }
}

async function loadGroups() {
    showLoader(true);
    try {
        const data = await fetchSheet(RANGE_GROUPS);
        const uniqueGroups = new Set();
        data.forEach(row => {
            let g = row.at(0) ? row.at(0).trim() : "";
            let cleanCheck = g.replace(/[\s\-—_.,]+/g, '');
            if (cleanCheck !== '' && !g.includes('undefined')) uniqueGroups.add(g);
        });
allGroups = Array.from(uniqueGroups).sort();
document.getElementById('group-list').innerHTML = allGroups.map(g =>
'' + escapeHtml(g) + ''
).join('');
} catch (e) {
alert('Ошибка загрузки данных');
}
showLoader(false);
}
async function loadTeachers() {
showLoader(true);
try {
const last = await fetchSheet(RANGE_TEACHER_LAST);
const first = await fetchSheet(RANGE_TEACHER_FIRST);
const middle = await fetchSheet(RANGE_TEACHER_MIDDLE);
const uniqueTeachers = new Set();
for (let i = 0; i < last.length; i++) {
let l = last.at(i) ? last.at(i).at(0) : "";
let f = first.at(i) ? first.at(i).at(0) : "";
let m = middle.at(i) ? middle.at(i).at(0) : "";
let full = (l + ' ' + f + ' ' + m).replace(/\s+/g, ' ').trim();
let cleanCheck = full.replace(/[\s-—_.,]+/g, '');
if (cleanCheck !== '' && !full.includes('undefined') && full !== '- - -') {
uniqueTeachers.add(full);
}
}
allTeachers = Array.from(uniqueTeachers).sort();
document.getElementById('teacher-list').innerHTML = allTeachers.map(t =>
'' + escapeHtml(t) + ''
).join('');
} catch (e) {
alert('Ошибка загрузки данных');
}
showLoader(false);
}
function openSchedule(type, name, keepDate = false) {
currentType = type;
currentName = normalizeCell(name);
document.getElementById('schedule-type').innerText = type === 'group' ? 'Группа' : 'Преподаватель';
document.getElementById('schedule-name').innerText = name;
if (!keepDate) currentDate = new Date();
saveState();
updateFavoriteUI();
updateWeekUI();
updatePushTags();
showScreen('screen-schedule');
loadSchedule();
}
function goToLastSchedule() {
if (currentName === '') {
showScreen('screen-groups');
} else {
showScreen('screen-schedule');
}
}
function filterList(listId, query) {
const parent = document.getElementById(listId);
const items = parent.children;
query = query.toLowerCase();
for (let item of items) {
item.style.display = item.innerText.toLowerCase().includes(query) ? '' : 'none';
}
}
function goBack() {
if (currentType === 'group') showScreen('screen-groups');
else if (currentType === 'teacher') showScreen('screen-teachers');
else showScreen('screen-main');
}
// ---- РАБОТА С ДАТАМИ ----
function getMonday(d) {
d = new Date(d);
var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1);
return new Date(d.setDate(diff));
}
function updateWeekUI() {
const monday = getMonday(currentDate);
const daysContainer = document.getElementById('days-container');
if (!daysContainer) return;
let html = '';
const dayNames = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
for (let i = 0; i < 6; i++) {
let d = new Date(monday);
d.setDate(monday.getDate() + i);
let isActive = d.getDate() === currentDate.getDate() && d.getMonth() === currentDate.getMonth();
html += '' +
'' + dayNames[i] + '' +
'' + d.getDate() + '' +
'';
}
daysContainer.innerHTML = html;
let saturday = new Date(monday);
saturday.setDate(monday.getDate() + 5);
const opt = { day: 'numeric', month: 'short' };
let strMon = monday.toLocaleDateString('ru-RU', opt).replace('.', '');
let strSat = saturday.toLocaleDateString('ru-RU', opt).replace('.', '');
document.getElementById('week-range').innerText = strMon + ' – ' + strSat + '.';
}
function selectDay(timestamp) {
currentDate = new Date(timestamp);
saveState();
updateWeekUI();
loadSchedule();
}
function changeWeek(delta) {
currentDate.setDate(currentDate.getDate() + (delta * 7));
saveState();
updateWeekUI();
loadSchedule();
}
function getTimeForPair(pairNum, dayOfWeek, isDistance) {
if (isDistance) {
switch (pairNum) {
case "1": return "8:30–9:30"; case "2": return "9:40–10:40";
case "3": return "10:50–11:50"; case "4": return "12:00–13:00";
default: return "";
}
}
if (dayOfWeek === 1) {
switch (pairNum) {
case "0": return "8:30–9:15"; case "1": return "9:20–10:50";
case "2": return "11:00–12:30"; case "3": return "13:15–14:45";
case "4": return "14:55–16:25"; default: return "";
}
}
if (dayOfWeek === 6) {
switch (pairNum) {
case "1": return "8:30–10:00"; case "2": return "10:10–11:40";
case "3": return "11:50–13:20"; default: return "";
}
}
switch (pairNum) {
case "1": return "8:30–10:00"; case "2": return "10:10–11:40";
case "3": return "12:25–13:55"; case "4": return "14:05–15:35";
default: return "";
}
}
async function loadSchedule() {
showLoader(true);
const targetDay = currentDate.getDate();
const targetMonth = currentDate.getMonth() + 1;
const targetYear = currentDate.getFullYear();
const jsDay = currentDate.getDay();
const ourDay = jsDay === 0 ? 7 : jsDay;
if (!cachedData) {
try {
cachedData = await fetchSheet(RANGE_SCHEDULE);
} catch (e) {
document.getElementById('schedule-list').innerHTML = 'Нет подключения к интернету.Подключитесь к сети для первой загрузки.';
showLoader(false);
return;
}
}
let html = '';
for (let row of cachedData) {
if (!row || row.length < 5) continue;
let day = parseInt(row.at(0)), month = parseInt(row.at(1)), year = parseInt(row.at(2));
if (isNaN(day) || isNaN(month) || isNaN(year)) continue;
if (day !== targetDay || month !== targetMonth || year !== targetYear) continue;
let pairNum = normalizeCell(row.at(3));
let group = normalizeCell(row.at(4));
let subject = normalizeCell(row.at(6));
let room = normalizeCell(row.at(7));
let teacher = normalizeCell((row.at(8) || '') + ' ' + (row.at(9) || '') + ' ' + (row.at(10) || ''));
if (currentType === 'group' && group.toLowerCase() !== currentName.toLowerCase()) continue;
if (currentType === 'teacher' && teacher.toLowerCase() !== currentName.toLowerCase()) continue;
let numberStr = pairNum === '0' ? '' : pairNum + '.';
let displayTeacher = currentType === 'teacher' ? group : teacher;
let isDistance = subject.toLowerCase().includes('(до)') || subject.toLowerCase().includes('дистант');
let timeStr = getTimeForPair(pairNum, ourDay, isDistance);
html += '' +
'' +
'' + escapeHtml(numberStr) + '' +
'' + escapeHtml(subject) + '' +
'' +
'' + escapeHtml(timeStr) + '' +
'' +
'👤' + escapeHtml(displayTeacher) + '' +
'' + escapeHtml(room) + '' +
'' +
'';
}
if (html === '') html = 'На этот день пар нет';
document.getElementById('schedule-list').innerHTML = html;
showLoader(false);
}
function showLoader(show) {
const loader = document.getElementById('loader');
if (loader) loader.classList.toggle('active', show);
}
// ==========================================
// ОБНОВЛЕНИЕ ДАННЫХ (pull-to-refresh)
// ==========================================
window.updateData = async () => {
cachedData = null;
allGroups = [];
allTeachers = [];
localStorage.removeItem('btt_cache_' + RANGE_GROUPS);
localStorage.removeItem('btt_cache_' + RANGE_TEACHER_LAST);
localStorage.removeItem('btt_cache_' + RANGE_TEACHER_FIRST);
localStorage.removeItem('btt_cache_' + RANGE_TEACHER_MIDDLE);
localStorage.removeItem('btt_cache_' + RANGE_SCHEDULE);
await loadStats();
if (document.getElementById('screen-groups').classList.contains('active')) await loadGroups();
else if (document.getElementById('screen-teachers').classList.contains('active')) await loadTeachers();
else if (document.getElementById('screen-schedule').classList.contains('active')) await loadSchedule();
};
(function initPullToRefresh() {
let startY = 0;
let pulling = false;
let isRefreshing = false;
const THRESHOLD = 70;
document.addEventListener('touchstart', (e) => {
if (isRefreshing) return;
const scroller = document.querySelector('.screen.active .content');
if (scroller && scroller.scrollTop <= 0) {
startY = e.touches.item(0).clientY;
pulling = true;
}
}, { passive: true });
document.addEventListener('touchmove', (e) => {
if (!pulling || isRefreshing) return;
const delta = e.touches.item(0).clientY - startY;
if (delta > THRESHOLD) {
pulling = false;
isRefreshing = true;
showLoader(true);
window.updateData().finally(() => {
showLoader(false);
setTimeout(() => { isRefreshing = false; }, 400);
});
}
}, { passive: true });
document.addEventListener('touchend', () => { pulling = false; }, { passive: true });
})();
// ==========================================
// WEB PUSH УВЕДОМЛЕНИЯ (ONESIGNAL v16)
// ==========================================
let oneSignalReady = false;
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function(OneSignal) {
try {
await OneSignal.init({
appId: ONESIGNAL_APP_ID,
serviceWorkerParam: { scope: '/' },
serviceWorkerPath: '/sw.js',
allowLocalhostAsSecureOrigin: true
});
oneSignalReady = true;
const isSubscribed = Boolean(OneSignal.User.PushSubscription.optedIn);
localStorage.setItem('btt_notifications', isSubscribed ? 'on' : 'off');
updateSettingsUI();
await updatePushTags();
OneSignal.User.PushSubscription.addEventListener('change', async (event) => {
const active = Boolean(event.current && event.current.optedIn);
localStorage.setItem('btt_notifications', active ? 'on' : 'off');
updateSettingsUI();
if (active) {
await updatePushTags();
}
});
} catch (e) {
console.error('Ошибка инициализации OneSignal:', e);
}
});
function getNotificationsEnabled() {
try { return localStorage.getItem('btt_notifications') === 'on'; }
catch (e) { return false; }
}
async function setNotificationsEnabled(enabled) {
if (!oneSignalReady || !window.OneSignal) {
alert('Сервис уведомлений ещё загружается. Подождите пару секунд и попробуйте снова.');
updateSettingsUI();
return;
}
if (enabled) {
const fav = getFavorite();
if (!fav && !currentName) {
alert('Сначала откройте расписание нужной группы или преподавателя (или добавьте его в избранное ⭐).');
localStorage.setItem('btt_notifications', 'off');
updateSettingsUI();
return;
}
const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
if (isIOSDevice && !isPWA) {
alert('На iPhone уведомления работают только после установки приложения на экран «Домой» (кнопка «Поделиться» → «На экран „Домой“»).');
localStorage.setItem('btt_notifications', 'off');
updateSettingsUI();
return;
}
try {
await OneSignal.Notifications.requestPermission();
if (OneSignal.Notifications.permission) {
await OneSignal.User.PushSubscription.optIn();
localStorage.setItem('btt_notifications', 'on');
await updatePushTags();
} else {
localStorage.setItem('btt_notifications', 'off');
alert('Разрешение на уведомления заблокировано. Включите его в настройках браузера или устройства.');
}
} catch (e) {
console.error('Ошибка подписки на уведомления:', e);
localStorage.setItem('btt_notifications', 'off');
}
} else {
try {
await OneSignal.User.PushSubscription.optOut();
} catch (e) {
console.error('Ошибка отписки:', e);
}
localStorage.setItem('btt_notifications', 'off');
}
updateSettingsUI();
}
async function updatePushTags() {
if (!oneSignalReady || !window.OneSignal) return;
try {
const fav = getFavorite();
const targetName = normalizeCell(fav ? fav.name : currentName).toLowerCase();
if (targetName) {
await OneSignal.User.addTag('target', targetName);
} else {
await OneSignal.User.removeTag('target');
}
} catch (e) {
console.error('Ошибка обновления тега OneSignal:', e);
}
}
// ==========================================
// ЛОГИКА PWA
// ==========================================
let deferredPrompt;
const installBtn = document.getElementById('install-btn');
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
if (installBtn && isIOS && !isStandalone) {
installBtn.style.display = 'block';
}
window.addEventListener('beforeinstallprompt', (e) => {
e.preventDefault();
deferredPrompt = e;
if (installBtn && !isStandalone) installBtn.style.display = 'block';
});
if (installBtn) {
installBtn.addEventListener('click', async () => {
if (isIOS) {
alert("Чтобы установить приложение на iPhone:\n\n1. Нажмите кнопку 'Поделиться' в Safari.\n2. Выберите 'На экран «Домой»'.\n3. Нажмите 'Добавить'.");
return;
}
if (deferredPrompt) {
deferredPrompt.prompt();
await deferredPrompt.userChoice;
deferredPrompt = null;
installBtn.style.display = 'none';
}
});
}
window.addEventListener('appinstalled', () => {
if (installBtn) installBtn.style.display = 'none';
});