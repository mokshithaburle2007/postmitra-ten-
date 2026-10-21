import { createContext, useContext, useState, useCallback, createElement } from 'react';

export const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिं' },
  { code: 'te', label: 'తె' },
];

const en = {
  'nav.apply': 'Apply', 'nav.track': 'Track status', 'nav.staff': 'Staff login',
  'apply.title': 'Apply for a scheme',
  'apply.sub': 'Send your request to your local post office. No other website needed.',
  'f.scheme': 'Scheme', 'f.scheme.pick': 'Choose a scheme', 'f.name': 'Applicant name', 'f.phone': 'Mobile number',
  'f.dob': 'Date of birth', 'f.village': 'Village / town', 'f.district': 'District',
  'f.postOffice': 'Preferred post office', 'f.nomineeName': 'Nominee name', 'f.nomineeRelation': 'Relationship',
  'f.amount': 'Deposit amount (₹, approx.)', 'f.preferredDate': 'Date you can visit the post office',
  'f.docs': 'Documents I already have', 'f.note': 'Message (optional)', 'f.optional': 'optional',
  'consent': 'I agree to share these details with post office staff only for this application.',
  'submit': 'Send application', 'sending': 'Sending…',
  'done.title': 'Your request has been sent!', 'done.id': 'Your application number',
  'done.save': 'Keep this number safe. To check status on another phone you will need it with your mobile number.',
  'done.next': 'The post office will reply here. Check back soon.', 'done.view': 'View status', 'done.another': 'Apply for another',
  'doc.aadhaar': 'Aadhaar card', 'doc.photo': 'Passport photo', 'doc.address_proof': 'Address proof',
  'doc.pan': 'PAN card', 'doc.age_proof': 'Age proof', 'doc.nominee_details': 'Nominee details',
  'status.submitted': 'Sent', 'status.in_review': 'Under review', 'status.docs_needed': 'Documents needed',
  'status.appointment_confirmed': 'Visit date confirmed', 'status.completed': 'Completed',
  'status.rejected': 'Not approved', 'status.cancelled': 'Cancelled',
  'track.title': 'Application status', 'track.mine': 'My applications', 'track.none': 'You have not applied yet.',
  'track.lookup': 'Find by application number', 'track.id': 'Application number', 'track.find': 'Find',
  'track.messages': 'Messages with the post office', 'track.type': 'Write your message', 'track.send': 'Send',
  'track.nomsg': 'No messages yet.', 'track.cancel': 'Cancel application',
  'track.cancelConfirm': 'Do you really want to cancel this application?', 'track.timeline': 'Progress',
  'track.visit': 'Visit date', 'track.office': 'Post office', 'track.update': 'Update from post office',
  'track.back': 'Back', 'track.you': 'You', 'track.staff': 'Post office', 'track.new': 'new',
  'track.closed': 'This application is closed. Messaging is turned off.', 'track.bring': 'Documents you said you have',
  'err.required': 'This is required', 'err.invalid_name': 'Enter a valid name', 'err.invalid_phone': 'Enter a valid 10-digit mobile number',
  'err.invalid_dob': 'Enter a valid date of birth', 'err.invalid_scheme': 'Choose a scheme', 'err.invalid_date': 'Choose a date from today onwards',
  'err.invalid_amount': 'Enter a valid amount', 'err.consent_required': 'Please tick to agree',
  'err.too_many_requests': 'Too many attempts. Please wait a while and try again.', 'err.not_found': 'No match found. Check the number and mobile.',
  'err.closed': 'This application is closed.', 'err.network': 'Cannot reach the server. Check your internet and try again.',
  'err.server_error': 'Something went wrong. Please try again.', 'err.generic': 'Something went wrong. Please try again.',
  'nav.account': 'Account',
  'auth.signin': 'Sign in', 'auth.register': 'Create account',
  'auth.title': 'Sign in to continue', 'auth.why': 'Sign-in keeps your applications private. Only you can see them.',
  'auth.name': 'Your name', 'auth.phone': 'Mobile number', 'auth.pin': '4-digit PIN', 'auth.pin2': 'Type the PIN again',
  'auth.pinHint': 'Do not use an easy PIN like 1234. Remember it and do not share it.',
  'auth.go.signin': 'Sign in', 'auth.go.register': 'Create account', 'auth.working': 'Please wait…',
  'auth.hi': 'Hello', 'auth.signout': 'Sign out', 'auth.forgot': 'Forgot your PIN? Ask the post office staff to reset it, then sign in with the temporary PIN they give you.',
  'acct.title': 'My account', 'acct.changePin': 'Change PIN', 'acct.oldPin': 'Current PIN', 'acct.newPin': 'New PIN', 'acct.newPin2': 'New PIN again',
  'acct.saved': 'Your PIN has been changed.', 'acct.mustChange': 'The post office reset your PIN. Please choose a new PIN now.',
  'apply.phoneFrom': 'Mobile number (from your account)',
  'err.invalid_pin': 'PIN must be exactly 4 digits', 'err.weak_pin': 'That PIN is too easy to guess. Choose another.',
  'err.same_pin': 'Choose a different PIN from the current one', 'err.pin_mismatch': 'The two PINs do not match',
  'err.phone_taken': 'An account with this number already exists. Sign in instead.', 'err.invalid_credentials': 'Wrong mobile number or PIN',
  'err.locked': 'Too many wrong attempts. The account is locked for a while. Try later, or ask the post office to reset your PIN.',
  'err.unauthorized': 'Please sign in again.',
};

const hi = {
  'nav.apply': 'आवेदन करें', 'nav.track': 'स्थिति देखें', 'nav.staff': 'स्टाफ़ लॉगिन',
  'apply.title': 'योजना के लिए आवेदन करें',
  'apply.sub': 'अपना अनुरोध अपने डाकघर को भेजें। किसी दूसरी वेबसाइट पर जाने की ज़रूरत नहीं।',
  'f.scheme': 'योजना', 'f.scheme.pick': 'योजना चुनें', 'f.name': 'आवेदक का नाम', 'f.phone': 'मोबाइल नंबर',
  'f.dob': 'जन्म तिथि', 'f.village': 'गाँव / शहर', 'f.district': 'ज़िला',
  'f.postOffice': 'पसंदीदा डाकघर', 'f.nomineeName': 'नामांकित व्यक्ति का नाम', 'f.nomineeRelation': 'संबंध',
  'f.amount': 'जमा राशि (₹, लगभग)', 'f.preferredDate': 'डाकघर आने की पसंदीदा तिथि',
  'f.docs': 'मेरे पास ये दस्तावेज़ पहले से हैं', 'f.note': 'संदेश (वैकल्पिक)', 'f.optional': 'वैकल्पिक',
  'consent': 'मैं सहमत हूँ कि मेरी जानकारी केवल इस आवेदन के लिए डाकघर स्टाफ़ के साथ साझा की जाए।',
  'submit': 'आवेदन भेजें', 'sending': 'भेजा जा रहा है…',
  'done.title': 'आपका अनुरोध भेज दिया गया है!', 'done.id': 'आपका आवेदन क्रमांक',
  'done.save': 'इसे सुरक्षित रखें। दूसरे फ़ोन पर स्थिति देखने के लिए यह क्रमांक और आपका मोबाइल नंबर चाहिए होगा।',
  'done.next': 'डाकघर यहीं जवाब देगा। थोड़ी देर बाद देखें।', 'done.view': 'स्थिति देखें', 'done.another': 'दूसरा आवेदन करें',
  'doc.aadhaar': 'आधार कार्ड', 'doc.photo': 'पासपोर्ट फ़ोटो', 'doc.address_proof': 'पते का प्रमाण',
  'doc.pan': 'पैन कार्ड', 'doc.age_proof': 'आयु प्रमाण', 'doc.nominee_details': 'नामांकित व्यक्ति का विवरण',
  'status.submitted': 'भेजा गया', 'status.in_review': 'समीक्षा में', 'status.docs_needed': 'दस्तावेज़ चाहिए',
  'status.appointment_confirmed': 'आने की तिथि पक्की', 'status.completed': 'पूर्ण',
  'status.rejected': 'स्वीकृत नहीं', 'status.cancelled': 'रद्द',
  'track.title': 'आवेदन की स्थिति', 'track.mine': 'मेरे आवेदन', 'track.none': 'आपने अभी तक आवेदन नहीं किया है।',
  'track.lookup': 'आवेदन क्रमांक से खोजें', 'track.id': 'आवेदन क्रमांक', 'track.find': 'खोजें',
  'track.messages': 'डाकघर के साथ संदेश', 'track.type': 'अपना संदेश लिखें', 'track.send': 'भेजें',
  'track.nomsg': 'अभी कोई संदेश नहीं।', 'track.cancel': 'आवेदन रद्द करें',
  'track.cancelConfirm': 'क्या आप सच में यह आवेदन रद्द करना चाहते हैं?', 'track.timeline': 'प्रगति',
  'track.visit': 'आने की तिथि', 'track.office': 'डाकघर', 'track.update': 'डाकघर की ओर से सूचना',
  'track.back': 'वापस', 'track.you': 'आप', 'track.staff': 'डाकघर', 'track.new': 'नया',
  'track.closed': 'यह आवेदन बंद हो चुका है। संदेश भेजना बंद है।', 'track.bring': 'आपके बताए दस्तावेज़',
  'err.required': 'यह जानकारी ज़रूरी है', 'err.invalid_name': 'सही नाम लिखें', 'err.invalid_phone': '10 अंकों का सही मोबाइल नंबर लिखें',
  'err.invalid_dob': 'सही जन्म तिथि लिखें', 'err.invalid_scheme': 'योजना चुनें', 'err.invalid_date': 'आज या उसके बाद की तिथि चुनें',
  'err.invalid_amount': 'सही राशि लिखें', 'err.consent_required': 'कृपया सहमति पर टिक करें',
  'err.too_many_requests': 'बहुत ज़्यादा कोशिशें। कुछ देर बाद फिर प्रयास करें।', 'err.not_found': 'कोई मिलान नहीं मिला। क्रमांक और मोबाइल जाँचें।',
  'err.closed': 'यह आवेदन बंद है।', 'err.network': 'सर्वर से संपर्क नहीं हो पा रहा। इंटरनेट जाँचकर फिर प्रयास करें।',
  'err.server_error': 'कुछ गड़बड़ हो गई। कृपया फिर प्रयास करें।', 'err.generic': 'कुछ गड़बड़ हो गई। कृपया फिर प्रयास करें।',
  'nav.account': 'खाता',
  'auth.signin': 'साइन इन', 'auth.register': 'खाता बनाएँ',
  'auth.title': 'आगे बढ़ने के लिए साइन इन करें', 'auth.why': 'साइन इन से आपके आवेदन सुरक्षित रहते हैं। उन्हें केवल आप ही देख सकते हैं।',
  'auth.name': 'आपका नाम', 'auth.phone': 'मोबाइल नंबर', 'auth.pin': '4 अंकों का पिन', 'auth.pin2': 'पिन दोबारा लिखें',
  'auth.pinHint': 'आसान पिन (जैसे 1234) न रखें। इसे याद रखें और किसी को न बताएँ।',
  'auth.go.signin': 'साइन इन करें', 'auth.go.register': 'खाता बनाएँ', 'auth.working': 'कृपया प्रतीक्षा करें…',
  'auth.hi': 'नमस्ते', 'auth.signout': 'साइन आउट', 'auth.forgot': 'पिन भूल गए? डाकघर स्टाफ़ से पिन रीसेट करवाएँ, फिर उनके दिए अस्थायी पिन से साइन इन करें।',
  'acct.title': 'मेरा खाता', 'acct.changePin': 'पिन बदलें', 'acct.oldPin': 'अभी का पिन', 'acct.newPin': 'नया पिन', 'acct.newPin2': 'नया पिन दोबारा',
  'acct.saved': 'आपका पिन बदल दिया गया है।', 'acct.mustChange': 'डाकघर ने आपका पिन रीसेट किया है। कृपया अभी नया पिन चुनें।',
  'apply.phoneFrom': 'मोबाइल नंबर (आपके खाते से)',
  'err.invalid_pin': 'पिन ठीक 4 अंकों का होना चाहिए', 'err.weak_pin': 'यह पिन बहुत आसान है। कोई और चुनें।',
  'err.same_pin': 'अभी वाले पिन से अलग पिन चुनें', 'err.pin_mismatch': 'दोनों पिन एक जैसे नहीं हैं',
  'err.phone_taken': 'इस नंबर का खाता पहले से है। साइन इन करें।', 'err.invalid_credentials': 'मोबाइल नंबर या पिन गलत है',
  'err.locked': 'बहुत ज़्यादा गलत कोशिशें हुईं। खाता कुछ देर के लिए बंद है। बाद में प्रयास करें, या डाकघर से पिन रीसेट करवाएँ।',
  'err.unauthorized': 'कृपया फिर से साइन इन करें।',
};

const te = {
  'nav.apply': 'దరఖాస్తు చేయండి', 'nav.track': 'స్థితి చూడండి', 'nav.staff': 'సిబ్బంది లాగిన్',
  'apply.title': 'పథకానికి దరఖాస్తు చేయండి',
  'apply.sub': 'మీ అభ్యర్థనను మీ పోస్టాఫీసుకు పంపండి. మరో వెబ్‌సైట్‌కు వెళ్లాల్సిన అవసరం లేదు.',
  'f.scheme': 'పథకం', 'f.scheme.pick': 'పథకాన్ని ఎంచుకోండి', 'f.name': 'దరఖాస్తుదారు పేరు', 'f.phone': 'మొబైల్ నంబర్',
  'f.dob': 'పుట్టిన తేదీ', 'f.village': 'గ్రామం / పట్టణం', 'f.district': 'జిల్లా',
  'f.postOffice': 'ఇష్టమైన పోస్టాఫీసు', 'f.nomineeName': 'నామినీ పేరు', 'f.nomineeRelation': 'బంధం',
  'f.amount': 'డిపాజిట్ మొత్తం (₹, సుమారుగా)', 'f.preferredDate': 'పోస్టాఫీసుకు రాగల తేదీ',
  'f.docs': 'నా దగ్గర ఇప్పటికే ఉన్న పత్రాలు', 'f.note': 'సందేశం (ఐచ్ఛికం)', 'f.optional': 'ఐచ్ఛికం',
  'consent': 'ఈ దరఖాస్తు కోసం మాత్రమే నా వివరాలను పోస్టాఫీసు సిబ్బందితో పంచుకోవడానికి నేను అంగీకరిస్తున్నాను.',
  'submit': 'దరఖాస్తు పంపండి', 'sending': 'పంపుతున్నాం…',
  'done.title': 'మీ అభ్యర్థన పంపబడింది!', 'done.id': 'మీ దరఖాస్తు సంఖ్య',
  'done.save': 'దీన్ని భద్రంగా ఉంచండి. మరో ఫోన్‌లో స్థితి చూడాలంటే ఈ సంఖ్య మరియు మీ మొబైల్ నంబర్ అవసరం.',
  'done.next': 'పోస్టాఫీసు ఇక్కడే సమాధానం ఇస్తుంది. కొద్దిసేపటి తర్వాత చూడండి.', 'done.view': 'స్థితి చూడండి', 'done.another': 'మరో దరఖాస్తు',
  'doc.aadhaar': 'ఆధార్ కార్డు', 'doc.photo': 'పాస్‌పోర్ట్ ఫోటో', 'doc.address_proof': 'చిరునామా రుజువు',
  'doc.pan': 'పాన్ కార్డు', 'doc.age_proof': 'వయస్సు రుజువు', 'doc.nominee_details': 'నామినీ వివరాలు',
  'status.submitted': 'పంపబడింది', 'status.in_review': 'పరిశీలనలో ఉంది', 'status.docs_needed': 'పత్రాలు కావాలి',
  'status.appointment_confirmed': 'రావాల్సిన తేదీ ఖరారు', 'status.completed': 'పూర్తయింది',
  'status.rejected': 'ఆమోదించబడలేదు', 'status.cancelled': 'రద్దు చేయబడింది',
  'track.title': 'దరఖాస్తు స్థితి', 'track.mine': 'నా దరఖాస్తులు', 'track.none': 'మీరు ఇంకా దరఖాస్తు చేయలేదు.',
  'track.lookup': 'దరఖాస్తు సంఖ్యతో వెతకండి', 'track.id': 'దరఖాస్తు సంఖ్య', 'track.find': 'వెతకండి',
  'track.messages': 'పోస్టాఫీసుతో సందేశాలు', 'track.type': 'మీ సందేశం రాయండి', 'track.send': 'పంపండి',
  'track.nomsg': 'ఇంకా సందేశాలు లేవు.', 'track.cancel': 'దరఖాస్తును రద్దు చేయండి',
  'track.cancelConfirm': 'మీరు ఈ దరఖాస్తును నిజంగా రద్దు చేయాలనుకుంటున్నారా?', 'track.timeline': 'పురోగతి',
  'track.visit': 'రావాల్సిన తేదీ', 'track.office': 'పోస్టాఫీసు', 'track.update': 'పోస్టాఫీసు నుండి సమాచారం',
  'track.back': 'వెనుకకు', 'track.you': 'మీరు', 'track.staff': 'పోస్టాఫీసు', 'track.new': 'కొత్త',
  'track.closed': 'ఈ దరఖాస్తు ముగిసింది. సందేశాలు పంపడం నిలిపివేయబడింది.', 'track.bring': 'మీరు చెప్పిన పత్రాలు',
  'err.required': 'ఈ సమాచారం అవసరం', 'err.invalid_name': 'సరైన పేరు రాయండి', 'err.invalid_phone': '10 అంకెల సరైన మొబైల్ నంబర్ రాయండి',
  'err.invalid_dob': 'సరైన పుట్టిన తేదీ రాయండి', 'err.invalid_scheme': 'పథకాన్ని ఎంచుకోండి', 'err.invalid_date': 'ఈరోజు లేదా ఆ తర్వాతి తేదీని ఎంచుకోండి',
  'err.invalid_amount': 'సరైన మొత్తం రాయండి', 'err.consent_required': 'దయచేసి అంగీకారంపై టిక్ చేయండి',
  'err.too_many_requests': 'చాలా ప్రయత్నాలు. కొంత సేపటి తర్వాత మళ్లీ ప్రయత్నించండి.', 'err.not_found': 'సరిపోలిక దొరకలేదు. సంఖ్య మరియు మొబైల్ సరిచూడండి.',
  'err.closed': 'ఈ దరఖాస్తు ముగిసింది.', 'err.network': 'సర్వర్‌ను చేరుకోలేకపోతున్నాం. ఇంటర్నెట్ చూసి మళ్లీ ప్రయత్నించండి.',
  'err.server_error': 'ఏదో పొరపాటు జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి.', 'err.generic': 'ఏదో పొరపాటు జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి.',
  'nav.account': 'ఖాతా',
  'auth.signin': 'సైన్ ఇన్', 'auth.register': 'ఖాతా సృష్టించండి',
  'auth.title': 'కొనసాగడానికి సైన్ ఇన్ చేయండి', 'auth.why': 'సైన్ ఇన్ వల్ల మీ దరఖాస్తులు గోప్యంగా ఉంటాయి. వాటిని మీరు మాత్రమే చూడగలరు.',
  'auth.name': 'మీ పేరు', 'auth.phone': 'మొబైల్ నంబర్', 'auth.pin': '4 అంకెల పిన్', 'auth.pin2': 'పిన్ మళ్లీ రాయండి',
  'auth.pinHint': 'సులభమైన పిన్ (ఉదా. 1234) పెట్టవద్దు. గుర్తుంచుకోండి, ఎవరికీ చెప్పవద్దు.',
  'auth.go.signin': 'సైన్ ఇన్ చేయండి', 'auth.go.register': 'ఖాతా సృష్టించండి', 'auth.working': 'దయచేసి వేచి ఉండండి…',
  'auth.hi': 'నమస్కారం', 'auth.signout': 'సైన్ అవుట్', 'auth.forgot': 'పిన్ మర్చిపోయారా? పోస్టాఫీసు సిబ్బందిని పిన్ రీసెట్ చేయమని అడగండి, ఆపై వారు ఇచ్చే తాత్కాలిక పిన్‌తో సైన్ ఇన్ చేయండి.',
  'acct.title': 'నా ఖాతా', 'acct.changePin': 'పిన్ మార్చండి', 'acct.oldPin': 'ప్రస్తుత పిన్', 'acct.newPin': 'కొత్త పిన్', 'acct.newPin2': 'కొత్త పిన్ మళ్లీ',
  'acct.saved': 'మీ పిన్ మారింది.', 'acct.mustChange': 'పోస్టాఫీసు మీ పిన్‌ను రీసెట్ చేసింది. దయచేసి ఇప్పుడే కొత్త పిన్ ఎంచుకోండి.',
  'apply.phoneFrom': 'మొబైల్ నంబర్ (మీ ఖాతా నుండి)',
  'err.invalid_pin': 'పిన్ సరిగ్గా 4 అంకెలు ఉండాలి', 'err.weak_pin': 'ఈ పిన్ ఊహించడం చాలా సులభం. మరొకటి ఎంచుకోండి.',
  'err.same_pin': 'ప్రస్తుత పిన్ కంటే వేరే పిన్ ఎంచుకోండి', 'err.pin_mismatch': 'రెండు పిన్‌లు ఒకేలా లేవు',
  'err.phone_taken': 'ఈ నంబర్‌తో ఖాతా ఇప్పటికే ఉంది. సైన్ ఇన్ చేయండి.', 'err.invalid_credentials': 'మొబైల్ నంబర్ లేదా పిన్ తప్పు',
  'err.locked': 'చాలా తప్పు ప్రయత్నాలు జరిగాయి. ఖాతా కొంతసేపు నిలిపివేయబడింది. తర్వాత ప్రయత్నించండి, లేదా పోస్టాఫీసులో పిన్ రీసెట్ చేయించుకోండి.',
  'err.unauthorized': 'దయచేసి మళ్లీ సైన్ ఇన్ చేయండి.',
};

const DICTS = { en, hi, te };
const LangCtx = createContext({ lang: 'en', setLang: () => {}, t: (k) => en[k] || k });

function readLang() {
  try {
    const v = localStorage.getItem('pm_lang');
    return DICTS[v] ? v : 'en';
  } catch { return 'en'; }
}

// Pass `initial` to follow the language your existing PostMitra app already has.
export function LangProvider({ children, initial }) {
  const [lang, setLangState] = useState(initial && DICTS[initial] ? initial : readLang);
  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem('pm_lang', l); } catch { /* storage may be blocked */ }
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((k) => DICTS[lang][k] ?? en[k] ?? k, [lang]);
  return createElement(LangCtx.Provider, { value: { lang, setLang, t } }, children);
}

export const useLang = () => useContext(LangCtx);

export function errMessage(t, e) {
  if (!e) return '';
  const key = `err.${e.code || 'generic'}`;
  const m = t(key);
  return m === key ? t('err.generic') : m;
}
