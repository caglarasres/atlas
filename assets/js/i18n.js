/* Atlas — dil katmanı.
   Türkçe metin index.html içindedir (asıl kaynak). İngilizce ve Almanca çeviriler
   burada tutulur; anahtarlar HTML'deki data-i18n değerleriyle eşleşir.
   Bağlantı: ?lang=en ya da ?lang=de — seçim tarayıcıda hatırlanır. */
(function () {
  'use strict';

  var DICT = {
    en: {
      'meta.title': 'Atlas Oral & Dental Health Clinic — Zirconia Crowns in Kahramanmaraş, Türkiye',
      'meta.desc': 'Zirconia crowns, veneers, E-max, implants, root canal treatment, orthodontics and whitening in Kahramanmaraş, Türkiye. Explore each treatment in 3D and book a visit.',
      'skip': 'Skip to content',
      'brand.sub': 'Oral & Dental Health Clinic',
      'nav.zr': 'Zirconia', 'nav.tx': 'Treatments', 'nav.process': 'Process', 'nav.reviews': 'Reviews', 'nav.contact': 'Contact', 'nav.team': 'Dentists',
      'team.label': '08 — Dentists', 'team.title': 'Your smile,<br><em>in good hands.</em>', 'team.lede': 'Meet the dentists who will look after you.',
      'phone.display': '+90 546 177 43 77',
      'cta.book': 'Book a visit', 'cta.call': 'Call',

      'hero.eyebrow': 'Zirconia crowns',
      'hero.title': 'No metal.<br>No grey line.<br>Only <em>light.</em>',
      'hero.lede': "At Atlas, every zirconia crown is designed individually — around your tooth shade, your facial features and your bite. The aim isn't an artificial white, but a natural smile that is unmistakably yours.",
      'hero.cta2': 'See the treatments in 3D',
      'hero.rating': '17 Google reviews',
      'tile.name': 'Zirconium', 'tile.w': '91.224',
      'r.score': '5.0',
      'ticker': 'Zirconia|Veneers|E-max|Implants|Oral surgery|Root canal treatment|Whitening|Orthodontics|Children’s dentistry|Gum treatment|Botox',

      's1.label': '01 — Material',
      's1.title': 'Why<br><em>zirconia?</em>',
      's1.lede': 'Zirconium dioxide is one of the strongest ceramics used in dentistry. It is white, metal-free, and lets light through much like natural enamel. Scroll on to see the crown from every side.',
      'step1.t': 'No metal inside.',
      'step1.p': 'The framework is zirconium dioxide ceramic, not metal — as white inside as it is outside. That is why the grey shimmer that can appear along the gumline of metal-based crowns does not occur.',
      'step2.t': 'Lets light through like enamel.',
      'step2.p': "A natural tooth doesn't just reflect light — it takes it in. Zirconia's translucent structure passes light in a similar way, giving the crown a depth that blends with the neighbouring teeth.",
      'step3.t': 'Built for chewing forces.',
      'step3.p': 'Thanks to its high strength, it can be used not only on front teeth but also on back teeth and bridges, where chewing loads are greatest.',
      'step3.stat': '≈ 900–1,200 MPa',
      'step3.statl': 'Typical flexural strength. The value varies with the type of material.',
      'step4.t': 'Kind to tissue.',
      'step4.p': 'Zirconia is biocompatible and, being metal-free, is also an option for people with metal sensitivities. Its smooth surface helps reduce plaque build-up, and it conducts little heat or cold.',

      'sh.label': '02 — Shade',
      'sh.title': 'White is never<br>just one <em>shade.</em>',
      'sh.p': "A crown's colour isn't picked from a catalogue — it starts with you: your existing tooth shade, your skin tone and what you hope for are considered together. Tap a shade and watch how the light changes on the surface.",
      'sh.bl1': 'Bleach white', 'sh.b1': 'Ivory', 'sh.a1': 'Light natural', 'sh.a2': 'Natural', 'sh.a3': 'Warm natural',
      'sh.note': 'On-screen shades are illustrative. The actual shade is selected in the clinic with a shade guide.',

      'c.label': '03 — Options',
      'c.title': 'Zirconia, veneers,<br>E-max: <em>which one?</em>',
      'c.lede': 'All three are metal-free, aesthetic ceramic options. They differ in how much of the tooth they cover and where their strengths lie. The right choice is made at the examination, based on the condition of the tooth.',
      'c.where': 'Where', 'c.prep': 'Preparation', 'c.key': 'Stands out for', 'c.watch': 'Watch in 3D',
      'c.a.name': 'Zirconia crown', 'c.a.sub': 'A ceramic crown that covers the whole tooth.',
      'c.a.where': 'Front and back teeth, bridges, implant crowns', 'c.a.prep': 'On all surfaces of the tooth', 'c.a.key': 'High strength',
      'c.b.name': 'Laminate veneer', 'c.b.sub': 'A thin porcelain shell bonded only to the front of the tooth.',
      'c.b.where': 'Colour, shape and gap corrections on front teeth', 'c.b.prep': 'Front surface only, minimal', 'c.b.key': 'Least preparation',
      'c.c.sub': 'A highly translucent glass ceramic (lithium disilicate).',
      'c.c.where': 'Front-tooth crowns, veneers, inlays and onlays', 'c.c.prep': 'Depends on the restoration', 'c.c.key': 'High translucency',

      't.label': '04 — Treatments',
      't.title': 'See inside<br><em>the treatment.</em>',
      't.lede': 'Each treatment is explained here with a three-dimensional model. Choose a treatment, watch the animation, and drag the model to turn it.',
      't.hint': 'Drag to rotate',
      't.nogl': "The 3D view couldn't start on this device; the treatment descriptions are below.",
      't.play': 'Play / pause', 't.scrub': 'Animation position',
      't.cta': 'Book for this treatment',
      't.also': 'Also', 't.also.items': 'Botox treatments · Oral surgery',
      't.note': 'Animations are illustrative; every treatment plan is individual.',

      'sc.zirkonyum.n': 'Zirconia crown',
      'sc.zirkonyum.d': 'The tooth is shaped to make room for the crown. The zirconia crown, made to measure, seats over the tooth and covers it completely.',
      'sc.zirkonyum.p1': 'Prepared tooth', 'sc.zirkonyum.p2': 'Crown seated',
      'sc.lamine.n': 'Laminate veneer',
      'sc.lamine.d': "The front surface of the tooth is reduced very slightly. A wafer-thin porcelain shell is bonded to it, renewing the tooth's colour and shape.",
      'sc.lamine.p1': 'Natural tooth', 'sc.lamine.p2': 'Veneer bonded',
      'sc.emax.d': 'Lithium disilicate glass ceramic lets light pass through it. That gives it a vitality close to natural enamel, especially on front teeth.',
      'sc.emax.p1': 'Light from behind', 'sc.emax.p2': 'Passes through the ceramic',
      'sc.implant.n': 'Dental implant',
      'sc.implant.d': 'A titanium screw is placed in the jawbone where the tooth is missing. After healing, an abutment and a crown are attached to it.',
      'sc.implant.p1': 'Implant', 'sc.implant.p2': 'Abutment', 'sc.implant.p3': 'Crown',
      'sc.kanal.n': 'Root canal treatment',
      'sc.kanal.d': 'The inflamed nerve tissue is removed, the canals are shaped and filled, and the tooth is sealed with a filling or crown. The goal is to save the tooth rather than extract it.',
      'sc.kanal.p1': 'Cleaning', 'sc.kanal.p2': 'Canal filling', 'sc.kanal.p3': 'Restoration',
      'sc.bleaching.n': 'Teeth whitening',
      'sc.bleaching.d': "A whitening gel applied under the dentist's supervision lightens discolouration in the tooth. No tooth substance is removed — only the shade changes.",
      'sc.bleaching.p1': 'Current shade', 'sc.bleaching.p2': 'Lighter shade',
      'sc.ortodonti.n': 'Orthodontics',
      'sc.ortodonti.d': 'Brackets bonded to the teeth and the wire running through them apply a light, continuous force. Over time the teeth move into alignment.',
      'sc.ortodonti.p1': 'Crowding', 'sc.ortodonti.p2': 'Alignment',
      'sc.cocuk.n': 'Children’s dentistry',
      'sc.cocuk.d': 'Decay starts easily in the deep grooves of the molars. A fissure sealant fills these grooves with a flowable protective layer, helping to shield the tooth from decay.',
      'sc.cocuk.p1': 'Deep grooves', 'sc.cocuk.p2': 'Fissure sealant',
      'sc.diseti.n': 'Gum treatment',
      'sc.diseti.d': 'Tartar and bacterial plaque cause redness and swelling of the gums. After cleaning and treatment, the gums can become firm and healthy again.',
      'sc.diseti.p1': 'Inflammation & tartar', 'sc.diseti.p2': 'Healthy gums',

      'p.label': '05 — Process',
      'p.title': 'From first exam<br>to final <em>check-up.</em>',
      'p.lede': 'A zirconia crown is usually completed over a few visits. The steps follow the same order for everyone; the time depends on the number of teeth and the condition of the mouth.',
      'p1.t': 'Examination & planning',
      'p1.p': 'Your teeth and gums are examined, with X-rays if needed. We listen to what you expect and explain the suitable options and the process clearly.',
      'p2.t': 'Preparation & impression',
      'p2.p': 'Under local anaesthesia, the teeth are prepared for the crowns and an impression is taken. Temporary crowns protect your teeth until the permanent ones are ready.',
      'p3.t': 'Try-in',
      'p3.p': 'The crowns are tried in your mouth; shape, length, colour and bite are checked together. Any adjustments are made at this stage.',
      'p4.t': 'Cementation & follow-up',
      'p4.p': 'The crowns are permanently cemented and the bite is adjusted one last time. You receive care advice and your follow-up appointment is scheduled.',

      'r.label': '06 — Reviews',
      'r.title': "In our patients'<br><em>own words.</em>",
      'r.meta': 'Google Maps · 17 reviews · October 2026',
      'r.link': 'Read all reviews on Google',
      'r.aria': 'Patient reviews', 'r.prev': 'Previous review', 'r.next': 'Next review',
      'r.note': 'Reviews are from Google Maps, translated from Turkish.',
      'q1': "Courteous staff, accomplished dentists, healthy teeth, beautiful smiles. Thanks to Ms Esra's skilled hands I can laugh out loud and eat whatever I like.",
      'q2': 'I had a full-mouth restoration done. They are very kind, attentive and professional. […] Thank you to both Mr Saim and Ms Esra.',
      'q3': "I had a root canal treatment and I'm very, very pleased — the care and attention, everything was great. Thank you, ATLAS.",
      'q4': 'The one place to go for a healthy, bright smile! Thank you so much for your care and attention.',
      'q5': 'A clinic well worth choosing — high quality, clean, with friendly and gentle doctors.',
      'q6': 'Experienced hands, a warm welcome, and you leave satisfied. A light touch. We recommend it to our friends.',
      'q7': 'Mr Saim and his team are very attentive and friendly — I recommend them to everyone :)',
      'q8': 'Everything just as we wanted. Well done, Dr Saim.',
      'q9': 'I went to ATLAS today to have my stitches removed — thank you for the care and attention.',

      'f.label': '07 — Questions',
      'f.title': 'Frequently<br><em>asked.</em>',
      'f1.q': 'Is getting a zirconia crown painful?',
      'f1.a': 'The tooth is prepared under local anaesthesia, so the aim is for you to feel no pain during the procedure. Mild sensitivity for a few days afterwards is normal.',
      'f2.q': 'How long do zirconia crowns last?',
      'f2.a': 'Their lifespan depends on oral hygiene, gum health and habits such as clenching. With regular brushing, interdental cleaning and dental check-ups, they can serve for many years.',
      'f3.q': 'Do they discolour over time?',
      'f3.a': 'The glazed, polished surface of zirconia resists staining from tea, coffee and the like. What matters most is the health of the gum around the crown.',
      'f4.q': 'Zirconia crown or veneer?',
      'f4.a': 'If the tooth has a large filling, a fracture or a root canal treatment, a zirconia crown that covers the whole tooth is usually preferred. If the tooth is sound and the concern is only colour or shape, a veneer — which needs less preparation — may be considered. The decision is made at the examination.',
      'f5.q': 'I have a metal allergy — can I have zirconia?',
      'f5.a': 'Zirconia crowns contain no metal and are a common choice for people with metal sensitivities. Simply mention it to your dentist at the examination.',
      'f6.q': 'How many visits does it take?',
      'f6.a': 'It depends on the number of teeth and the condition of your mouth; it is usually completed in a few visits. Your individual plan becomes clear at the first examination.',

      'k.label': '09 — Contact',
      'k.title': "Let's talk about<br><em>your smile.</em>",
      'k.addr.l': 'Address',
      'k.addr': 'Boğaziçi Mah., Bahçeci Hoca Bulvarı<br>Nurkent Sitesi altı No: 35A<br>46050 Onikişubat / Kahramanmaraş, Türkiye',
      'k.coord.l': 'Coordinates', 'k.coord': '37.5823° N · 36.8672° E',
      'k.hours.l': 'Opening hours', 'k.hours': 'See Google Maps for current hours, or give us a call.',
      'k.dir': 'Get directions', 'k.dir.short': 'Directions',
      'b.title': 'Appointment request',
      'b.name': 'Your name', 'b.tx': "Treatment you're interested in", 'b.note': 'Your note (optional)',
      'b.botox': 'Botox', 'b.general': 'General check-up',
      'b.send': 'Send via WhatsApp',
      'b.privacy': 'This form stores no data; your message opens in your own WhatsApp.',
      'ft.legal': 'The content of this site is for information only and does not replace diagnosis or treatment.',
      'ft.top': 'Back to top',
      'wa.msg': 'Hello, this is {name}. I would like to book an appointment for: {tx}.',
      'b.phone': 'Mobile number', 'b.doctor': 'Dentist', 'b.anydoc': 'No preference', 'b.date': 'Date', 'b.time': 'Time',
      'b.consent': 'I have read the privacy notice and agree to my personal data being processed for this appointment.',
      'b.send2': 'Book appointment',
      'b.privacy2': 'The clinic will confirm your appointment by phone. Your details are used only for your appointment and treatment.',
      'bk.pick': 'Choose a date first.', 'bk.loading': 'Loading times…', 'bk.none': 'No free times on this day. Please try another date.',
      'bk.e.name': 'Please enter your name.', 'bk.e.phone': 'Please enter a valid Turkish mobile number (05xx…).', 'bk.e.time': 'Please choose a date and time.',
      'bk.e.consent': 'Please accept the privacy notice.', 'bk.e.net': 'Something went wrong. Please call us or try again.',
      'bk.ok.t': 'Request received.', 'bk.ok.p': '{date}, {time} · {doctor} · {service}. We will call you to confirm.'
    },

    de: {
      'meta.title': 'Atlas Zahnklinik — Zirkonkronen in Kahramanmaraş, Türkei',
      'meta.desc': 'Zirkonkronen, Veneers, E-max, Implantate, Wurzelbehandlung, Kieferorthopädie und Bleaching in Kahramanmaraş, Türkei. Behandlungen in 3D ansehen und Termin vereinbaren.',
      'skip': 'Zum Inhalt springen',
      'brand.sub': 'Klinik für Zahn- und Mundgesundheit',
      'nav.zr': 'Zirkon', 'nav.tx': 'Behandlungen', 'nav.process': 'Ablauf', 'nav.reviews': 'Bewertungen', 'nav.contact': 'Kontakt', 'nav.team': 'Zahnärzte',
      'team.label': '08 — Zahnärzte', 'team.title': 'Ihr Lächeln<br><em>in guten Händen.</em>', 'team.lede': 'Lernen Sie die Zahnärztinnen und Zahnärzte kennen, die Sie behandeln.',
      'phone.display': '+90 546 177 43 77',
      'cta.book': 'Termin vereinbaren', 'cta.call': 'Anrufen',

      'hero.eyebrow': 'Zirkonkronen',
      'hero.title': 'Kein Metall.<br>Kein grauer Rand.<br>Nur <em>Licht.</em>',
      'hero.lede': 'Bei Atlas wird jede Zirkonkrone einzeln gestaltet – passend zu Ihrer Zahnfarbe, Ihren Gesichtszügen und Ihrem Biss. Das Ziel ist kein künstliches Weiß, sondern ein natürliches Lächeln, das zu Ihnen gehört.',
      'hero.cta2': 'Behandlungen in 3D ansehen',
      'hero.rating': '17 Google-Bewertungen',
      'tile.name': 'Zirconium', 'tile.w': '91,224',
      'r.score': '5,0',
      'ticker': 'Zirkon|Veneers|E-max|Implantate|Kieferchirurgie|Wurzelbehandlung|Bleaching|Kieferorthopädie|Kinderzahnheilkunde|Zahnfleischbehandlung|Botox',

      's1.label': '01 — Material',
      's1.title': 'Warum<br><em>Zirkon?</em>',
      's1.lede': 'Zirkoniumdioxid gehört zu den stabilsten Keramiken der Zahnmedizin. Es ist weiß, metallfrei und lässt Licht ähnlich durch wie natürlicher Zahnschmelz. Scrollen Sie weiter und sehen Sie die Krone von allen Seiten.',
      'step1.t': 'Kein Metall im Inneren.',
      'step1.p': 'Das Gerüst besteht aus Zirkoniumdioxid-Keramik, nicht aus Metall – innen so weiß wie außen. Deshalb entsteht am Zahnfleischrand kein grauer Schimmer, wie er bei metallgestützten Kronen auftreten kann.',
      'step2.t': 'Lässt Licht durch wie Schmelz.',
      'step2.p': 'Ein natürlicher Zahn reflektiert Licht nicht nur, er nimmt es auch auf. Die transluzente Struktur von Zirkon leitet Licht ähnlich weiter – so erhält die Krone eine Tiefe, die sich in die Nachbarzähne einfügt.',
      'step3.t': 'Hält Kaukräften stand.',
      'step3.p': 'Dank der hohen Festigkeit eignet sich Zirkon nicht nur für Frontzähne, sondern auch für Seitenzähne und Brücken, wo die Kaubelastung am größten ist.',
      'step3.stat': '≈ 900–1.200 MPa',
      'step3.statl': 'Typische Biegefestigkeit. Der Wert variiert je nach Materialtyp.',
      'step4.t': 'Verträglich fürs Gewebe.',
      'step4.p': 'Zirkon ist biokompatibel und – weil metallfrei – auch für Menschen mit Metallunverträglichkeit geeignet. Die glatte Oberfläche hilft, Plaqueanlagerung zu verringern, und leitet Wärme und Kälte nur wenig.',

      'sh.label': '02 — Farbton',
      'sh.title': 'Weiß ist nie nur<br>ein <em>Farbton.</em>',
      'sh.p': 'Die Farbe einer Krone wird nicht aus dem Katalog gewählt – sie geht von Ihnen aus: Ihre Zahnfarbe, Ihr Hautton und Ihre Wünsche werden gemeinsam betrachtet. Tippen Sie auf einen Farbton und sehen Sie, wie sich das Licht auf der Oberfläche verändert.',
      'sh.bl1': 'Bleach-Weiß', 'sh.b1': 'Elfenbein', 'sh.a1': 'Hell natürlich', 'sh.a2': 'Natürlich', 'sh.a3': 'Warm natürlich',
      'sh.note': 'Die Farbtöne am Bildschirm sind beispielhaft. Die tatsächliche Farbauswahl erfolgt in der Klinik mit einer Farbskala.',

      'c.label': '03 — Optionen',
      'c.title': 'Zirkon, Veneers,<br>E-max: <em>was passt?</em>',
      'c.lede': 'Alle drei sind metallfreie, ästhetische Keramiklösungen. Sie unterscheiden sich darin, wie viel vom Zahn sie bedecken und wo ihre Stärken liegen. Die richtige Wahl wird bei der Untersuchung getroffen – je nach Zustand des Zahns.',
      'c.where': 'Einsatz', 'c.prep': 'Präparation', 'c.key': 'Stärke', 'c.watch': 'In 3D ansehen',
      'c.a.name': 'Zirkonkrone', 'c.a.sub': 'Eine Keramikkrone, die den ganzen Zahn umschließt.',
      'c.a.where': 'Front- und Seitenzähne, Brücken, Implantatkronen', 'c.a.prep': 'An allen Zahnflächen', 'c.a.key': 'Hohe Festigkeit',
      'c.b.name': 'Veneer', 'c.b.sub': 'Eine dünne Keramikschale, die nur auf die Vorderseite des Zahns geklebt wird.',
      'c.b.where': 'Korrekturen von Farbe, Form und Lücken an Frontzähnen', 'c.b.prep': 'Nur an der Vorderfläche, minimal', 'c.b.key': 'Geringster Substanzabtrag',
      'c.c.sub': 'Eine hochtransluzente Glaskeramik (Lithiumdisilikat).',
      'c.c.where': 'Frontzahnkronen, Veneers, Inlays und Onlays', 'c.c.prep': 'Je nach Versorgung', 'c.c.key': 'Hohe Transluzenz',

      't.label': '04 — Behandlungen',
      't.title': 'Blicken Sie in<br><em>die Behandlung.</em>',
      't.lede': 'Jede Behandlung wird hier an einem dreidimensionalen Modell erklärt. Wählen Sie eine Behandlung, sehen Sie die Animation an und drehen Sie das Modell durch Ziehen.',
      't.hint': 'Zum Drehen ziehen',
      't.nogl': 'Die 3D-Ansicht konnte auf diesem Gerät nicht gestartet werden; die Beschreibungen finden Sie unten.',
      't.play': 'Abspielen / Pause', 't.scrub': 'Position der Animation',
      't.cta': 'Termin für diese Behandlung',
      't.also': 'Außerdem', 't.also.items': 'Botox-Behandlungen · Kieferchirurgie',
      't.note': 'Die Animationen sind schematisch; jeder Behandlungsplan ist individuell.',

      'sc.zirkonyum.n': 'Zirkonkrone',
      'sc.zirkonyum.d': 'Der Zahn wird so präpariert, dass Platz für die Krone entsteht. Die nach Maß gefertigte Zirkonkrone wird aufgesetzt und umschließt den Zahn vollständig.',
      'sc.zirkonyum.p1': 'Präparierter Zahn', 'sc.zirkonyum.p2': 'Krone sitzt',
      'sc.lamine.n': 'Veneer',
      'sc.lamine.d': 'Die Vorderfläche des Zahns wird nur minimal abgetragen. Eine hauchdünne Keramikschale wird aufgeklebt und erneuert Farbe und Form des Zahns.',
      'sc.lamine.p1': 'Natürlicher Zahn', 'sc.lamine.p2': 'Veneer verklebt',
      'sc.emax.d': 'Lithiumdisilikat-Glaskeramik lässt Licht durch sich hindurch. Das verleiht ihr, besonders an Frontzähnen, eine Lebendigkeit nahe am natürlichen Schmelz.',
      'sc.emax.p1': 'Licht von hinten', 'sc.emax.p2': 'Geht durch die Keramik',
      'sc.implant.n': 'Implantat',
      'sc.implant.d': 'Anstelle des fehlenden Zahns wird eine Titanschraube in den Kieferknochen gesetzt. Nach der Einheilung werden ein Aufbau (Abutment) und eine Krone befestigt.',
      'sc.implant.p1': 'Implantat', 'sc.implant.p2': 'Abutment', 'sc.implant.p3': 'Krone',
      'sc.kanal.n': 'Wurzelkanalbehandlung',
      'sc.kanal.d': 'Das entzündete Nervgewebe wird entfernt, die Kanäle werden aufbereitet und gefüllt, und der Zahn wird mit einer Füllung oder Krone verschlossen. Ziel ist es, den Zahn zu erhalten, statt ihn zu ziehen.',
      'sc.kanal.p1': 'Reinigung', 'sc.kanal.p2': 'Wurzelfüllung', 'sc.kanal.p3': 'Restauration',
      'sc.bleaching.n': 'Bleaching',
      'sc.bleaching.d': 'Ein unter zahnärztlicher Aufsicht aufgetragenes Bleaching-Gel hellt Verfärbungen des Zahns auf. Es wird keine Zahnsubstanz abgetragen – nur der Farbton ändert sich.',
      'sc.bleaching.p1': 'Aktueller Farbton', 'sc.bleaching.p2': 'Hellerer Farbton',
      'sc.ortodonti.n': 'Kieferorthopädie',
      'sc.ortodonti.d': 'Auf die Zähne geklebte Brackets und der durchlaufende Draht üben eine leichte, kontinuierliche Kraft aus. Mit der Zeit richten sich die Zähne aus.',
      'sc.ortodonti.p1': 'Engstand', 'sc.ortodonti.p2': 'Ausrichtung',
      'sc.cocuk.n': 'Kinderzahnheilkunde',
      'sc.cocuk.d': 'In den tiefen Rillen der Backenzähne entsteht Karies besonders leicht. Eine Fissurenversiegelung verschließt diese Rillen mit einer fließfähigen Schutzschicht und hilft, den Zahn vor Karies zu schützen.',
      'sc.cocuk.p1': 'Tiefe Fissuren', 'sc.cocuk.p2': 'Versiegelung',
      'sc.diseti.n': 'Zahnfleischbehandlung',
      'sc.diseti.d': 'Zahnstein und bakterielle Plaque führen zu Rötung und Schwellung des Zahnfleischs. Nach Reinigung und Behandlung kann das Zahnfleisch wieder straff und gesund werden.',
      'sc.diseti.p1': 'Entzündung & Zahnstein', 'sc.diseti.p2': 'Gesundes Zahnfleisch',

      'p.label': '05 — Ablauf',
      'p.title': 'Vom ersten Termin<br>bis zur <em>Kontrolle.</em>',
      'p.lede': 'Eine Zirkonkrone ist meist in wenigen Sitzungen fertig. Die Schritte folgen für alle derselben Reihenfolge; die Dauer hängt von der Zahl der Zähne und dem Zustand des Mundes ab.',
      'p1.t': 'Untersuchung & Planung',
      'p1.p': 'Zähne und Zahnfleisch werden untersucht, bei Bedarf geröntgt. Wir hören Ihre Wünsche an und erklären Ihnen die passenden Möglichkeiten und den Ablauf verständlich.',
      'p2.t': 'Präparation & Abformung',
      'p2.p': 'Unter örtlicher Betäubung werden die Zähne für die Kronen präpariert und abgeformt. Bis die endgültigen Kronen fertig sind, schützen Provisorien Ihre Zähne.',
      'p3.t': 'Anprobe',
      'p3.p': 'Die Kronen werden im Mund anprobiert; Form, Länge, Farbe und Biss werden gemeinsam geprüft. Nötige Anpassungen erfolgen in dieser Phase.',
      'p4.t': 'Einsetzen & Kontrolle',
      'p4.p': 'Die Kronen werden dauerhaft befestigt und der Biss ein letztes Mal eingestellt. Sie erhalten Pflegehinweise, und Ihr Kontrolltermin wird geplant.',

      'r.label': '06 — Bewertungen',
      'r.title': 'In den Worten<br><em>unserer Patienten.</em>',
      'r.meta': 'Google Maps · 17 Bewertungen · Oktober 2026',
      'r.link': 'Alle Bewertungen auf Google lesen',
      'r.aria': 'Patientenbewertungen', 'r.prev': 'Vorherige Bewertung', 'r.next': 'Nächste Bewertung',
      'r.note': 'Bewertungen von Google Maps, aus dem Türkischen übersetzt.',
      'q1': 'Zuvorkommende Mitarbeiter, hervorragende Zahnärzte, gesunde Zähne, schönes Lächeln. Dank der geschickten Hände von Frau Esra kann ich unbeschwert lachen und essen, was ich möchte.',
      'q2': 'Ich habe eine Komplettsanierung machen lassen. Sehr freundlich, aufmerksam und professionell. […] Vielen Dank an Herrn Saim und Frau Esra.',
      'q3': 'Ich hatte eine Wurzelbehandlung und bin sehr, sehr zufrieden – die Betreuung, einfach alles war sehr gut. Danke, ATLAS.',
      'q4': 'Die Adresse für ein gesundes, strahlendes Lächeln! Vielen Dank für die aufmerksame Betreuung.',
      'q5': 'Eine Klinik, die man gern wählt – hochwertig, sauber, mit freundlichen und einfühlsamen Ärzten.',
      'q6': 'Erfahrene Hände, ein freundlicher Empfang, und man geht zufrieden. Eine leichte Hand. Wir empfehlen die Klinik unseren Freunden.',
      'q7': 'Herr Saim und sein Team sind sehr aufmerksam und freundlich – ich empfehle sie jedem :)',
      'q8': 'Alles genau so, wie wir es wollten. Vielen Dank, Dr. Saim.',
      'q9': 'Ich war heute bei ATLAS, um meine Fäden ziehen zu lassen – danke für die aufmerksame Betreuung.',

      'f.label': '07 — Fragen',
      'f.title': 'Häufig<br><em>gefragt.</em>',
      'f1.q': 'Ist eine Zirkonkrone schmerzhaft?',
      'f1.a': 'Der Zahn wird unter örtlicher Betäubung präpariert – Ziel ist, dass Sie während des Eingriffs keine Schmerzen spüren. Eine leichte Empfindlichkeit für einige Tage danach ist normal.',
      'f2.q': 'Wie lange halten Zirkonkronen?',
      'f2.a': 'Die Haltbarkeit hängt von Mundhygiene, Zahnfleischgesundheit und Gewohnheiten wie Zähnepressen ab. Mit regelmäßigem Putzen, Zahnzwischenraumpflege und Kontrollen können sie viele Jahre halten.',
      'f3.q': 'Verfärben sie sich mit der Zeit?',
      'f3.a': 'Die glasierte, polierte Oberfläche von Zirkon ist widerstandsfähig gegen Verfärbungen durch Tee, Kaffee und Ähnliches. Entscheidend ist vor allem die Gesundheit des Zahnfleischs rund um die Krone.',
      'f4.q': 'Zirkonkrone oder Veneer?',
      'f4.a': 'Hat der Zahn eine große Füllung, einen Bruch oder eine Wurzelbehandlung, ist meist die Zirkonkrone, die den ganzen Zahn umschließt, die bessere Wahl. Ist der Zahn gesund und geht es nur um Farbe oder Form, kommt ein Veneer infrage, das weniger Präparation erfordert. Die Entscheidung fällt bei der Untersuchung.',
      'f5.q': 'Ich habe eine Metallallergie – ist Zirkon für mich geeignet?',
      'f5.a': 'Zirkonkronen enthalten kein Metall und werden bei Metallunverträglichkeit häufig gewählt. Sprechen Sie es einfach bei der Untersuchung an.',
      'f6.q': 'Wie viele Sitzungen sind nötig?',
      'f6.a': 'Das hängt von der Zahl der Zähne und dem Zustand Ihres Mundes ab; meist sind es wenige Sitzungen. Ihr persönlicher Plan steht nach der ersten Untersuchung fest.',

      'k.label': '09 — Kontakt',
      'k.title': 'Sprechen wir über<br><em>Ihr Lächeln.</em>',
      'k.addr.l': 'Adresse',
      'k.addr': 'Boğaziçi Mah., Bahçeci Hoca Bulvarı<br>Nurkent Sitesi altı No: 35A<br>46050 Onikişubat / Kahramanmaraş, Türkei',
      'k.coord.l': 'Koordinaten', 'k.coord': '37,5823° N · 36,8672° O',
      'k.hours.l': 'Öffnungszeiten', 'k.hours': 'Aktuelle Zeiten finden Sie auf Google Maps – oder rufen Sie uns an.',
      'k.dir': 'Route planen', 'k.dir.short': 'Route',
      'b.title': 'Terminanfrage',
      'b.name': 'Ihr Name', 'b.tx': 'Gewünschte Behandlung', 'b.note': 'Ihre Nachricht (optional)',
      'b.botox': 'Botox', 'b.general': 'Allgemeine Untersuchung',
      'b.send': 'Per WhatsApp senden',
      'b.privacy': 'Dieses Formular speichert keine Daten; Ihre Nachricht öffnet sich in Ihrem eigenen WhatsApp.',
      'ft.legal': 'Die Inhalte dieser Website dienen der Information und ersetzen weder Diagnose noch Behandlung.',
      'ft.top': 'Nach oben',
      'wa.msg': 'Guten Tag, hier ist {name}. Ich möchte einen Termin vereinbaren für: {tx}.',
      'b.phone': 'Handynummer', 'b.doctor': 'Zahnärztin / Zahnarzt', 'b.anydoc': 'Egal', 'b.date': 'Datum', 'b.time': 'Uhrzeit',
      'b.consent': 'Ich habe die Datenschutzhinweise gelesen und stimme der Verarbeitung meiner Daten für diesen Termin zu.',
      'b.send2': 'Termin anfragen',
      'b.privacy2': 'Die Praxis bestätigt Ihren Termin telefonisch. Ihre Daten werden nur für Termin und Behandlung verwendet.',
      'bk.pick': 'Bitte zuerst ein Datum wählen.', 'bk.loading': 'Zeiten werden geladen…', 'bk.none': 'An diesem Tag ist nichts frei. Bitte ein anderes Datum wählen.',
      'bk.e.name': 'Bitte geben Sie Ihren Namen ein.', 'bk.e.phone': 'Bitte eine gültige türkische Handynummer eingeben (05xx…).', 'bk.e.time': 'Bitte Datum und Uhrzeit wählen.',
      'bk.e.consent': 'Bitte bestätigen Sie die Datenschutzhinweise.', 'bk.e.net': 'Etwas ist schiefgelaufen. Bitte rufen Sie uns an oder versuchen Sie es erneut.',
      'bk.ok.t': 'Anfrage erhalten.', 'bk.ok.p': '{date}, {time} · {doctor} · {service}. Wir rufen Sie zur Bestätigung an.'
    }
  };

  /* Yalnızca JavaScript'in kullandığı Türkçe metinler */
  var TR_JS = {
    'wa.msg': 'Merhaba, ben {name}. Şu tedavi için randevu almak istiyorum: {tx}.',
    'bk.pick': 'Önce bir tarih seçin.', 'bk.loading': 'Saatler yükleniyor…', 'bk.none': 'Bu günde boş saat yok. Lütfen başka bir gün seçin.',
    'bk.e.name': 'Lütfen adınızı yazın.', 'bk.e.phone': 'Lütfen geçerli bir cep telefonu girin (05xx…).', 'bk.e.time': 'Lütfen tarih ve saat seçin.',
    'bk.e.consent': 'Lütfen aydınlatma metnini onaylayın.', 'bk.e.net': 'Bir sorun oluştu. Lütfen bizi arayın ya da tekrar deneyin.',
    'bk.ok.t': 'Talebiniz alındı.', 'bk.ok.p': '{date}, {time} · {doctor} · {service}. Teyit için sizi arayacağız.'
  };

  // yönetim paneli metin düzenleyicisi varsayılanları buradan okur
  window.AtlasDict = { en: DICT.en, de: DICT.de, trJs: TR_JS };
  if (!document.querySelector('[data-i18n]')) return;

  var SUPPORTED = ['tr', 'en', 'de'];
  var doc = document;
  var tr = {};
  var current = 'tr';

  function each(sel, fn) { Array.prototype.forEach.call(doc.querySelectorAll(sel), fn); }
  function pairs(el) {
    return el.getAttribute('data-i18n-attr').split(',').map(function (p) { var i = p.indexOf(':'); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; });
  }

  function capture() {
    each('[data-i18n]', function (el) {
      var k = el.getAttribute('data-i18n');
      if (!(k in tr)) tr[k] = el.innerHTML;
    });
    each('[data-i18n-attr]', function (el) {
      pairs(el).forEach(function (p) { if (!(p[1] in tr)) tr[p[1]] = el.getAttribute(p[0]); });
    });
    tr['meta.title'] = doc.title;
    var md = doc.querySelector('meta[name="description"]');
    tr['meta.desc'] = md ? md.getAttribute('content') : '';
    Object.keys(TR_JS).forEach(function (k) { tr[k] = TR_JS[k]; });
  }

  function t(key) {
    if (current !== 'tr' && DICT[current] && key in DICT[current]) return DICT[current][key];
    return key in tr ? tr[key] : '';
  }

  function apply(lang) {
    current = lang;
    doc.documentElement.lang = lang;
    each('[data-i18n]', function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (v !== '') el.innerHTML = v;
    });
    each('[data-i18n-attr]', function (el) {
      pairs(el).forEach(function (p) { var v = t(p[1]); if (v !== '') el.setAttribute(p[0], v); });
    });
    doc.title = t('meta.title');
    var md = doc.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', t('meta.desc'));
    each('[data-lang]', function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
  }

  function set(lang) {
    if (SUPPORTED.indexOf(lang) < 0 || lang === current) return;
    apply(lang);
    try { localStorage.setItem('atlas-lang', lang); } catch (e) {}
    try {
      var u = new URL(location.href);
      if (lang === 'tr') u.searchParams.delete('lang'); else u.searchParams.set('lang', lang);
      history.replaceState(null, '', u);
    } catch (e) {}
    doc.dispatchEvent(new CustomEvent('atlas:lang', { detail: { lang: lang } }));
  }

  capture();

  /* Panelde değiştirilen metinler (sunucu sayfaya window.ATLAS olarak gömer) */
  var A = window.ATLAS, touched = false;
  if (A && A.content) {
    ['en', 'de'].forEach(function (l) { Object.assign(DICT[l], A.content[l] || {}); });
    Object.assign(tr, A.content.tr || {});
    touched = Object.keys(A.content.tr || {}).length > 0;
  }
  if (A && A.clinic && A.clinic.phone) {
    tr['phone.display'] = A.clinic.phone;
    ['en', 'de'].forEach(function (l) { if (!(A.content && A.content[l] && A.content[l]['phone.display'])) DICT[l]['phone.display'] = A.clinic.phone; });
    touched = true;
  }

  var initial = 'tr';
  try {
    var q = new URLSearchParams(location.search).get('lang');
    var saved = localStorage.getItem('atlas-lang');
    if (q && SUPPORTED.indexOf(q) >= 0) initial = q;
    else if (saved && SUPPORTED.indexOf(saved) >= 0) initial = saved;
  } catch (e) {}
  if (initial !== 'tr' || touched) apply(initial);

  window.AtlasI18n = { t: t, set: set, get lang() { return current; } };
})();
