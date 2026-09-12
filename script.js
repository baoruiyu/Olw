// Language toggle
let currentLang = 'zh';

function toggleLanguage() {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    document.querySelectorAll('[data-zh][data-en]').forEach(el => {
        el.textContent = el.getAttribute(`data-${currentLang}`);
    });
    document.documentElement.lang = currentLang === 'zh' ? 'zh' : 'en';
}

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
window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
        navbar.style.background = 'rgba(26, 26, 46, 0.98)';
    } else {
        navbar.style.background = 'rgba(26, 26, 46, 0.95)';
    }
});

// Form submission handler
document.querySelector('.submit-btn').addEventListener('click', function(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const message = document.getElementById('message').value;
    
    if (!name || !email || !message) {
        alert(currentLang === 'zh' ? '请填写所有字段！' : 'Please fill in all fields!');
        return;
    }
    
    alert(currentLang === 'zh' ? '感谢联系猫头鹰教！我们会尽快回复您。' : 'Thank you for contacting the Owl Cult! We will get back to you soon.');
    document.querySelector('.form-grid').reset();
});

// Add parallax effect to hero
window.addEventListener('scroll', () => {
    const hero = document.querySelector('.hero');
    const scrolled = window.scrollY;
    hero.style.backgroundPositionY = scrolled * 0.5 + 'px';
});
