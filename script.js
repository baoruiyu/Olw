// Language toggle (choice persists across pages)
const LANG_KEY = 'owl-cult-lang';
let currentLang = 'zh';

function applyLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-zh][data-en]').forEach(el => {
        el.textContent = el.getAttribute(`data-${lang}`);
    });
    document.querySelectorAll('.nav-lang').forEach(btn => {
        btn.textContent = lang === 'zh' ? 'EN' : '中文';
    });
    document.documentElement.lang = lang === 'zh' ? 'zh' : 'en';
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
