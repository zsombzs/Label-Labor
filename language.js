// Language translations
const translations = {
    en: {
      'desktop-only': 'Desktop Only',
      'desktop-warning': 'Label Labor is currently only available on desktop/laptop.<br>If using a computer, please increase the window size!',
      'about': 'About us',
      'nav-login': 'Login',
      'what-is': 'What is Label Labor?',
      'demo-labels': 'Demo Labels',
      'contact-request': 'Request a Quote',
      'back-login': '← Back to Login',
      'login': 'Login',
      'username': 'Username',
      'password': 'Password',
      'all-labels': 'All generated labels: ',
      'demo-video': 'Tutorial Videos',
      'user-guide': 'User Guide',
      'step1-title': 'Login',
      'step1-desc': 'Log in on the main page using the username and password you received.',

      'step2-title': 'Download the Excel template',
      'step2-desc': 'Click the "Download Template Excel" button, then open the file. If Excel asks for it, enable macros. If you get stuck, write to this email address: info@labellabor.com',

      'step3-title': 'Filling out the template',
      'step3-desc': 'Paste your data into the <span style="color: red;">red-marked</span> columns (up to approx. 350 rows). Please pay attention to the following:<br><br><ul><li>Make sure there are no empty or unnecessary rows, and no extra spaces.</li><li>The "Pack_size" field format should be: quantity + space + unit (e.g. "1 kg", "400 ml").</li><li>For items sold individually, the correct format is simply: "pcs".</li><li>In the "Price" field, enter only the number (e.g. "19").</li></ul><br>When everything is ready, run the "Data_Sorting" macro – this will automatically fill the <span style="color: #378eff;">blue</span> columns.',

      'step4-title': 'Reviewing the data',
      'step4-desc': 'You may also manually modify the values in the <span style="color: #378eff;">blue</span> columns if necessary. Once everything looks correct, save the file.',

      'step5-title': 'Upload Excel, select label type',
      'step5-desc': 'Click the "Upload Excel File (.xlsm)" button and select your completed template. After uploading the file, choose the appropriate label type.',

      'step6-title': 'Check labels and download PDF',
      'step6-desc': 'Review the information displayed on the labels, then click the "Download PDF" button. If you want to generate new labels afterward, refresh the page before starting the process.',

      'step7-title': 'Printing the labels',
      'step7-desc': 'You can print the downloaded labels.pdf document with any standard printer — just like any invoice or regular document.',

      'contact-footer': 'Contact: info@labellabor.com',
      'contact': 'Contact us',
      
      // About page
      'about-title': 'Welcome to Label Labor!',
      'about-intro': 'In most of the stores, creating uniform shelf labels quickly and efficiently can be a real challenge.<br>Label Labor provides an easy solution: generate and print labels directly from a simple Excel spreadsheet.',
      'about-benefits-title': 'Benefits of using Label Labor:',
      'about-benefit-1': 'Hundreds of labels in just minutes',
      'about-benefit-2': 'Saving time and money on label creation',
      'about-benefit-3': 'Labels that can be printed on regular A4 paper — no need to buy expensive adhesive labels',
      'about-benefit-4': 'Printing labels even with a regular invoice printer — no special label printer required',
      'about-benefit-5': 'Personalized label formats',
      'about-benefit-6': 'Online support for introduction and usage',
      
      // Contact form
      'contact-form-title': 'Request a Personalized Quote!',
      'contact-name': 'Full Name',
      'contact-email': 'Email Address',
      'contact-company': 'Company Name',
      'contact-message': 'Message',
      'contact-submit': 'Send Request',
      'contact-success': 'Your request has been sent successfully!',
    'contact-error': 'An error occurred while sending the quote request. Please try again.',
    'login-success': 'Login successful! Redirecting...',
    'login-error': 'Invalid username or password!',
    'contact-subtitle-1': 'Pricing and Information',
    'contact-text-1': 'Custom-designed interface and label format for your company, with training included. Additional label formats can be provided upon request.',
    'contact-text-2': 'Afterwards, a monthly fee covers maintenance, bug fixes, and implementation of small modification requests.',
    'contact-subtitle-2': 'Helpful Information for us',
    'contact-text-3': 'Please provide the following information in the "Message" field:',
    'contact-benefit-1': 'How many different label sizes would you like to generate on the page',
    'contact-benefit-2': 'Within a given label size, how many different label layouts would you like to use',
    'contact-benefit-3': 'Number of logos you want to use on the various labels',
    'contact-benefit-4': 'Number of stores where you will use Label Labor',
    'form-location-hint': 'The quote request form can be found at the bottom of the page. Please fill it out according to the instructions provided.',
    'scroll-to-form': 'Go to Form',

    },
    hu: {
      'desktop-only': 'Desktop Only',
      'desktop-warning': 'A Label Labor jelenleg csak asztali számítógépen/laptopon érhető el.<br>Ha számítógépen használja, növelje az ablak méretét!',
      'about': 'Bemutatkozás',
      'nav-login': 'Bejelentkezés',
      'what-is': 'Mi az a Label Labor?',
      'demo-labels': 'Példa címkék',
      'contact-request': 'Árajánlat',
      'back-login': '← Vissza a bejelentkezéshez',
      'login': 'Bejelentkezés',
      'username': 'Felhasználónév',
      'password': 'Jelszó',
      'all-labels': 'Összes generált címke: ',
      'demo-video': 'Bemutató videók',
      'user-guide': 'Használati útmutató',

      'step1-title': 'Bejelentkezés',
      'step1-desc': 'Lépjen be a főoldalon a kapott felhasználónévvel és jelszóval.',

      'step2-title': 'Sablon excel letöltése',
      'step2-desc': 'Kattintson a "Sablon Excel letöltése" gombra, majd nyissa meg a fájlt. Ha az Excel kéri, engedélyezze a makrókat. Ha elakadna, írjon erre az email címre: info@labellabor.com',

      'step3-title': 'A sablon kitöltése',
      'step3-desc': 'A <span style="color: red;">pirossal jelölt</span> oszlopokba másolja be a saját adatait (legfeljebb kb. 350 sor). Ügyeljen az alábbiakra:<br><br><ul><li>Ne maradjanak üres vagy felesleges sorok, illetve szóközök.</li><li>A "Kiszerelés" mező formátuma: mennyiség + szóköz + mértékegység (pl. "1 kg", "400 ml").</li><li>Darabos termék esetén a helyes formátum: "db".</li><li>Az "Ár" mezőbe csak a számot írja (pl. "999"), a "Ft" megjelölést nem kell hozzáadni.</li></ul><br>Ha mindennel készen van, futtassa az "Adatok_rendszerezese" makrót – ez automatikusan kitölti a <span style="color: #378eff;">kék</span> oszlopokat.',

      'step4-title': 'Adatok ellenőrzése',
      'step4-desc': 'A <span style="color: #378eff;">kék</span> oszlopokban lévő értékeket is módosíthatja kézzel, ha szükséges. Ha mindent rendben talál, mentse el a fájlt.',

      'step5-title': 'Excel feltöltése, címketípus kiválasztása',
      'step5-desc': 'Kattintson az "Excel fájl feltöltése (.xlsm)" gombra, és válassza ki a kitöltött sablont. A fájl feltöltése után válassza ki a megfelelő címketípust.',

      'step6-title': 'Címkék ellenőrzése és PDF letöltése',
      'step6-desc': 'Ellenőrizze a címkéken megjelenő adatokat, majd kattintson a "PDF letöltése" gombra. Ha új címkéket szeretne generálni, frissítsen rá az oldalra a folyamat előtt.',

      'step7-title': 'Címkék nyomtatása',
      'step7-desc': 'A letöltött cimkek.pdf dokumentumot bármilyen hagyományos nyomtatóval kinyomtathatja – ugyanúgy, mint egy számlát vagy más dokumentumot.',

      'contact-footer': 'Kontakt: info@labellabor.com',
      'contact': 'Kapcsolat',
      
      // About page
      'about-title': 'Üdvözöllek a Label Labor oldalán!',
      'about-intro': 'A legtöbb boltban problémát jelent a polcsínbe való címkék gyors, költséghatékony és egységes előállítása.<br>A Label Labor erre kínál egyszerű megoldást: néhány kattintással készíthet és nyomtathat címkéket egyszerű Excel táblázatból.',
      'about-benefits-title': 'A Label Labor használatának előnyei:',
      'about-benefit-1': 'Több 100 címke percek alatt',
      'about-benefit-2': 'Időt és pénzt tud spórolni a címkék előállításán',
      'about-benefit-3': 'Hagyományos A4-es lapra is nyomtatható címkék, nem kell drága öntapadós címkét vásárolni',
      'about-benefit-4': 'Egyszerű számlanyomtatásra használt nyomtatóval is lehet címkét nyomtatni, nem szükséges speciális címkenyomtató',
      'about-benefit-5': 'Egyedi, személyre szabott címkeformátum',
      'about-benefit-6': 'Online támogatás a bevezetés és használat során',
      
      // Contact form
      'contact-form-title': 'Kérjen személyre szabott árajánlatot!',
      'contact-name': 'Név',
      'contact-email': 'Email cím',
      'contact-company': 'Cég neve',
      'contact-message': 'Üzenet',
      'contact-submit': 'Küldés',
      'contact-success': 'Árajánlat sikeresen elküldve!',
      'contact-error': 'Hiba történt az árajánlat küldésekor. Kérjük, próbálja újra.',
      'login-success': 'Sikeres bejelentkezés! Átirányítás...',
      'login-error': 'Hibás felhasználónév vagy jelszó!',
      'contact-subtitle-1': 'Árképzés és információk',
      'contact-text-1': 'A cégének egyedileg elkészített felület és címkeformátum, betanítás. Több címkeformátum kérés esetén.',
      'contact-text-2': 'Ezt követően havi díj ellenében biztosítjuk a karbantartást, hibajavítást és kisebb módosítási kérések teljesítését.',
      'contact-subtitle-2': 'Nekünk hasznos információk',
      'contact-text-3': 'Kérjük adja meg az alábbi információkat az "Üzenet" mezőbe:',
      'contact-benefit-1': 'Hány féle méretű címkét szeretne generálni az oldalon',
      'contact-benefit-2': 'Egy adott címkeméreten belül hány féle elrendezésű címkét szeretne használni',
      'contact-benefit-3': 'Felhasználni kívánt logók mennyisége a különböző címkéken',
      'contact-benefit-4': 'Boltjainak száma, ahol használná a Label Labort',
      'form-location-hint': 'Az űrlap az oldal alján található. Kérjük, megadott útmutató alapján töltse ki.',
      'scroll-to-form': 'Ugrás az űrlaphoz',

    }
  };
  
  // Get current language from localStorage or default to 'hu'
  let currentLang = localStorage.getItem('language') || 'hu';
  
  
  function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('language', lang);
    
    document.querySelectorAll('[data-lang]').forEach(element => {
      const key = element.getAttribute('data-lang');
      if (translations[lang][key]) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.placeholder = translations[lang][key];
        } else {
          
          if (key === 'all-labels') {
            const statsNumber = element.querySelector('.stats-number');
            if (statsNumber) {
              const numberValue = statsNumber.textContent;
              // Update text but preserve the counter element
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = translations[lang][key];
              const textContent = tempDiv.textContent;

              // Only update if not animating, or update text but keep number element
              if (typeof isCounterAnimating !== 'undefined' && isCounterAnimating) {
                // Keep the existing counter element during animation
                element.childNodes.forEach(node => {
                  if (node.nodeType === Node.TEXT_NODE) {
                    node.textContent = textContent;
                  }
                });
              } else {
                element.innerHTML = translations[lang][key] + '<span class="stats-number" id="totalLabelCount">' + numberValue + '</span>';
              }
            } else {
              element.innerHTML = translations[lang][key];
            }
          } else {
            element.innerHTML = translations[lang][key];
          }
        }
      }
    });
    
   
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-lang-code') === lang) {
        btn.classList.add('active');
      }
    });
    
    
    document.documentElement.lang = lang;
  }
  
  
  document.addEventListener('DOMContentLoaded', () => {
    changeLanguage(currentLang);
    
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang-code');
        changeLanguage(lang);
      });
    });
  });