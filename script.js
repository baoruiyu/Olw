// Language toggle (choice persists across pages)
const LANG_KEY = 'owl-cult-lang';
let currentLang = 'zh';

// Night proverbs shown in the footer (bilingual)
const PROVERBS = [
    { zh: '在黑暗中，我们看得更清楚。', en: 'In the darkness, we see more clearly.' },
    { zh: '沉默是夜的智慧，凝视是猫头鹰的语言。', en: 'Silence is the wisdom of the night; gazing is the language of owls.' },
    { zh: '别怕黑，那是我们最亮的时候。', en: 'Do not fear the dark — that is when we shine brightest.' },
    { zh: '白日的喧嚣属于众人，深夜的清醒属于我们。', en: 'The noisy day belongs to the crowd; the clear night belongs to us.' },
    { zh: '咕咪不是叫声，是暗号。', en: '"Gu Mi" is not a sound — it is a password.' },
    { zh: '看得越远的人，越先学会在黑夜中睁眼。', en: 'Those who see farthest are the first to open their eyes in the dark.' },
    { zh: '羽毛之下，藏着整个夜晚的秘密。', en: 'Beneath the feathers lies the secret of the whole night.' },
    { zh: '我们收藏月亮，也收藏所有未说出口的话。', en: 'We keep the moon, and every word left unspoken.' }
];
let proverbIndex = -1;

function applyLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-zh][data-en]').forEach(el => {
        el.textContent = el.getAttribute(`data-${lang}`);
    });
    document.querySelectorAll('.nav-lang').forEach(btn => {
        btn.textContent = lang === 'zh' ? 'EN' : '中文';
    });
    document.documentElement.lang = lang === 'zh' ? 'zh' : 'en';
    renderProverb(false);
}

// Render the current proverb in the active language (keeps the current one)
function renderProverb(animate) {
    const el = document.getElementById('proverbText');
    if (!el) return;
    if (proverbIndex < 0) {
        proverbIndex = Math.floor(Math.random() * PROVERBS.length);
    }
    const item = PROVERBS[proverbIndex];
    const text = currentLang === 'en' ? item.en : item.zh;
    if (animate) {
        el.classList.add('fade');
        setTimeout(() => {
            el.textContent = text;
            el.classList.remove('fade');
        }, 250);
    } else {
        el.textContent = text;
    }
}

// Show another random proverb (never repeats the current one)
function nextProverb() {
    if (PROVERBS.length > 1) {
        let next = proverbIndex;
        while (next === proverbIndex) {
            next = Math.floor(Math.random() * PROVERBS.length);
        }
        proverbIndex = next;
    }
    renderProverb(true);
}

function toggleLanguage() {
    const next = currentLang === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
    applyLanguage(next);
}

// Restore the language chosen on a previous page
try {
    const savedLang = localStorage.getItem(LANG_KEY);
    if (savedLang === 'zh' || savedLang === 'en') {
        applyLanguage(savedLang);
    }
} catch (e) {}

// First paint of the footer proverb
renderProverb(false);

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar background on scroll
const navbar = document.querySelector('.navbar');
if (navbar) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(26, 26, 46, 0.98)';
        } else {
            navbar.style.background = 'rgba(26, 26, 46, 0.95)';
        }
    });
}

// Submenu toggle (secondary owl gallery)
function toggleSubmenu(btn) {
    const content = btn.nextElementSibling;
    const arrow = btn.querySelector('.submenu-arrow');
    const isOpen = content.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    if (arrow) {
        arrow.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

// Add parallax effect to hero (home page only)
const hero = document.querySelector('.hero');
if (hero) {
    window.addEventListener('scroll', () => {
        hero.style.backgroundPositionY = window.scrollY * 0.5 + 'px';
    });
}
