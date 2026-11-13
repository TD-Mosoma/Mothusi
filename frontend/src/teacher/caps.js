// Suggested CAPS topics for Grades 1–4, with a starting objective and key words for each.
// These are planning shortcuts, not the official sequence: schools follow their own Annual Teaching Plan (ATP),
// so the planner always tells teachers to check the term against it. Term 0 means "any term".
const t = (term, topic, objective, words) => ({ term, topic, objective, words })

const MATHS = {
  'Grade 1': [
    t(1, 'Counting objects to 20', 'Count up to 20 everyday objects reliably and say how many there are.', ['count', 'number', 'how many', 'more', 'less']),
    t(1, 'Position and direction', 'Describe where an object is using words like in front of, behind, left and right.', ['left', 'right', 'in front of', 'behind', 'next to']),
    t(2, 'Adding and taking away to 10', 'Solve adding and taking-away stories up to 10 using objects and drawings.', ['add', 'take away', 'altogether', 'left over', 'equals']),
    t(2, '2D shapes', 'Recognise and name circles, triangles and squares in the classroom and at home.', ['circle', 'triangle', 'square', 'side', 'round']),
    t(3, 'Sharing equally (halves)', 'Share a whole fairly into two equal parts and call each part a half.', ['share', 'equal', 'half', 'whole', 'fair']),
    t(3, 'Comparing length', 'Compare two objects and say which is longer, shorter or the same length.', ['long', 'short', 'longer', 'shorter', 'same']),
    t(4, 'Number patterns', 'Copy and extend counting patterns in 2s, 5s and 10s.', ['pattern', 'next', 'count on', 'skip count']),
    t(4, 'Sorting objects (data)', 'Sort objects by one property and tell how many are in each group.', ['sort', 'group', 'same', 'different', 'most']),
  ],
  'Grade 2': [
    t(1, 'Tens and units to 99', 'Show two-digit numbers with tens and units and say the value of each digit.', ['tens', 'units', 'place value', 'digit']),
    t(1, 'Adding and subtracting to 99', 'Add and subtract two-digit numbers using a number line or by breaking up numbers.', ['add', 'subtract', 'number line', 'difference', 'total']),
    t(2, 'Repeated addition (groups of)', 'Solve problems with equal groups using repeated addition in 2s, 5s and 10s.', ['groups of', 'equal groups', 'repeated addition', 'times']),
    t(2, '3D objects', 'Recognise and describe balls, boxes and cylinders by how they roll or slide.', ['ball', 'box', 'cylinder', 'roll', 'slide', 'face']),
    t(3, 'Fractions: halves, quarters and thirds', 'Share wholes into halves, quarters and thirds and name the parts.', ['half', 'quarter', 'third', 'equal parts', 'whole']),
    t(3, 'Telling the time', 'Read o’clock and half past on an analogue clock.', ['clock', 'hour hand', 'minute hand', "o'clock", 'half past']),
    t(4, 'Money: rand and cents', 'Recognise South African coins and notes and work out simple totals.', ['rand', 'cents', 'coin', 'note', 'change']),
    t(4, 'Pictographs', 'Collect simple data and show it in a pictograph, then answer questions about it.', ['data', 'pictograph', 'most', 'least', 'tally']),
  ],
  'Grade 3': [
    t(1, 'Numbers to 1 000', 'Order, compare and break up three-digit numbers into hundreds, tens and units.', ['hundreds', 'tens', 'units', 'greater than', 'less than']),
    t(1, 'Adding and subtracting three-digit numbers', 'Add and subtract numbers up to 999 using breaking down and building up.', ['add', 'subtract', 'estimate', 'check', 'sum']),
    t(2, 'Multiplication and division', 'Multiply and divide using 2, 3, 4, 5 and 10 times tables in word problems.', ['multiply', 'divide', 'times table', 'share', 'remainder']),
    t(2, 'Money problems', 'Solve buying and change problems in rand and cents.', ['price', 'change', 'rand', 'cents', 'total']),
    t(3, 'Unit fractions', 'Name and compare halves, thirds, quarters, fifths, sixths and eighths of a whole.', ['fraction', 'numerator', 'denominator', 'equal parts', 'compare']),
    t(3, 'Capacity', 'Estimate and measure how much a container holds in litres and using informal units.', ['capacity', 'litre', 'full', 'empty', 'holds more']),
    t(4, 'Bar graphs', 'Draw and read a simple bar graph about the class.', ['bar graph', 'data', 'axis', 'most', 'least']),
    t(4, 'Perimeter', 'Measure the distance around a shape using informal units and centimetres.', ['perimeter', 'around', 'side', 'measure', 'centimetre']),
  ],
  'Grade 4': [
    t(1, 'Whole numbers to 10 000', 'Order, compare and represent four-digit numbers using place value.', ['thousands', 'place value', 'expanded notation', 'compare']),
    t(1, 'Common fractions', 'Compare and order common fractions and find equal fractions using diagrams.', ['fraction', 'numerator', 'denominator', 'equivalent', 'whole']),
    t(1, 'Time', 'Read and record time on analogue and digital clocks and calculate time intervals.', ['minutes', 'hours', 'analogue', 'digital', 'interval']),
    t(2, 'Multiplication (2-digit by 2-digit)', 'Multiply two-digit numbers using breaking down and the column method.', ['multiply', 'product', 'column', 'estimate']),
    t(2, 'Properties of 3D objects', 'Describe 3D objects by their faces, edges and vertices.', ['face', 'edge', 'vertex', 'prism', 'pyramid']),
    t(3, 'Length', 'Estimate, measure and convert length in millimetres, centimetres, metres and kilometres.', ['millimetre', 'centimetre', 'metre', 'kilometre', 'convert']),
    t(3, 'Division', 'Divide three-digit numbers by one-digit numbers and explain remainders.', ['divide', 'quotient', 'remainder', 'share equally']),
    t(4, 'Perimeter and area', 'Find perimeter by measuring and area by counting square units.', ['perimeter', 'area', 'square unit', 'grid']),
    t(4, 'Data handling and probability', 'Collect, organise and represent data in a bar graph and discuss how likely events are.', ['data', 'bar graph', 'likely', 'unlikely', 'certain']),
  ],
}

const HOME_LANGUAGE = {
  'Grade 1': [
    t(0, 'Phonics: first sounds', 'Hear and say the first sound in familiar words and match it to its letter.', ['sound', 'letter', 'begins with', 'word']),
    t(0, 'Shared reading: a picture story', 'Predict what happens in a story from the pictures and retell it in order.', ['picture', 'predict', 'beginning', 'end']),
    t(0, 'Handwriting: lowercase letters', 'Form lowercase letters correctly, starting at the right place.', ['letter', 'start', 'line', 'tall', 'short']),
    t(0, 'Speaking: my news', 'Tell the class a short piece of news in a few clear sentences.', ['news', 'tell', 'listen', 'take turns']),
  ],
  'Grade 2': [
    t(0, 'Phonics: consonant blends', 'Read and spell words with blends such as bl, cr and st.', ['blend', 'sound', 'spell', 'word']),
    t(0, 'Reading: questions about a story', 'Answer who, what and where questions about a story read in class.', ['character', 'setting', 'question', 'answer']),
    t(0, 'Writing: a short recount', 'Write three sentences about something they did, in the right order.', ['first', 'then', 'last', 'sentence', 'full stop']),
    t(0, 'Listening: following instructions', 'Listen to and carry out a set of three spoken instructions.', ['listen', 'instruction', 'first', 'next']),
  ],
  'Grade 3': [
    t(0, 'Phonics: vowel digraphs', 'Read and spell words with vowel pairs such as ai, ee and oa.', ['vowel', 'digraph', 'sound', 'spell']),
    t(0, 'Reading: stories and information texts', 'Tell the difference between a story and an information text and say why.', ['fiction', 'information', 'title', 'heading']),
    t(0, 'Writing: a paragraph', 'Write a short paragraph with a topic sentence and supporting sentences.', ['paragraph', 'topic sentence', 'detail', 'capital letter']),
    t(0, 'Language: nouns, verbs and adjectives', 'Find naming, doing and describing words in sentences.', ['noun', 'verb', 'adjective', 'sentence']),
  ],
  'Grade 4': [
    t(0, 'Folktales', 'Identify the characters, setting and lesson of a folktale.', ['folktale', 'character', 'setting', 'moral']),
    t(0, 'Writing a friendly letter', 'Write a friendly letter with an address, greeting, body and closing.', ['address', 'greeting', 'paragraph', 'closing']),
    t(0, 'Language: past and present tense', 'Use the past and present tense correctly in speaking and writing.', ['tense', 'past', 'present', 'verb']),
    t(0, 'Poetry: rhyme and rhythm', 'Read a poem aloud with expression and find rhyming words.', ['poem', 'rhyme', 'rhythm', 'line', 'verse']),
  ],
}

const FAL = {
  'Grade 1': [
    t(0, 'Greetings and classroom words', 'Greet others and respond to simple classroom instructions in the additional language.', ['hello', 'please', 'thank you', 'sit down', 'stand up']),
    t(0, 'My body', 'Name parts of the body and follow action songs.', ['head', 'hands', 'feet', 'eyes', 'mouth']),
    t(0, 'Colours and numbers', 'Name colours and count to ten in the additional language.', ['red', 'blue', 'green', 'one', 'ten']),
  ],
  'Grade 2': [
    t(0, 'My family and home', 'Name family members and rooms at home in simple sentences.', ['mother', 'father', 'brother', 'sister', 'kitchen']),
    t(0, 'Food and shopping', 'Ask for and name common foods using a simple sentence.', ['bread', 'milk', 'fruit', 'buy', 'shop']),
    t(0, 'Retelling a simple story', 'Retell a short story in the additional language using pictures.', ['story', 'first', 'then', 'end']),
  ],
  'Grade 3': [
    t(0, 'Weather and seasons', 'Describe the weather and the seasons in simple sentences.', ['sunny', 'rainy', 'cold', 'hot', 'season']),
    t(0, 'Reading a short story', 'Read a short story aloud and answer simple questions about it.', ['read', 'story', 'who', 'what']),
    t(0, 'Writing about myself', 'Write three simple sentences about themselves.', ['my name is', 'I am', 'I like', 'sentence']),
  ],
  'Grade 4': [
    t(0, 'Describing people and places', 'Describe a person or place using adjectives in full sentences.', ['tall', 'kind', 'busy', 'quiet', 'describe']),
    t(0, 'Reading for information', 'Find facts in a short information text and use them to answer questions.', ['fact', 'heading', 'find', 'information']),
    t(0, 'Writing an invitation', 'Write a short invitation with who, what, when and where.', ['invite', 'date', 'time', 'place']),
  ],
}

const LIFE_SKILLS = {
  'Grade 1': [
    t(1, 'All about me', 'Talk about themselves, their name, age and what they like.', ['name', 'age', 'like', 'special']),
    t(1, 'My family', 'Name the people in their family and how they help each other.', ['family', 'help', 'home', 'care']),
    t(2, 'Keeping clean and healthy', 'Explain and show how to wash hands and keep clean.', ['wash', 'soap', 'germs', 'clean', 'healthy']),
    t(3, 'Animals', 'Name common animals and say what they need to live.', ['animal', 'food', 'water', 'shelter']),
    t(4, 'Keeping safe', 'Name safe and unsafe places and who to ask for help.', ['safe', 'danger', 'help', 'trusted adult']),
  ],
  'Grade 2': [
    t(1, 'People who help us', 'Describe how community helpers such as nurses and police help us.', ['nurse', 'police', 'firefighter', 'community', 'help']),
    t(2, 'Healthy eating', 'Sort foods into healthy and less healthy choices and explain why.', ['healthy', 'food', 'fruit', 'vegetables', 'energy']),
    t(3, 'Seasons', 'Describe the four seasons and how weather changes.', ['summer', 'autumn', 'winter', 'spring', 'weather']),
    t(4, 'Road safety', 'Show how to cross the road safely.', ['road', 'cross', 'look', 'listen', 'pavement']),
  ],
  'Grade 3': [
    t(1, 'Our country', 'Recognise South Africa’s flag and other national symbols.', ['flag', 'symbol', 'country', 'anthem']),
    t(2, 'Day and night', 'Explain that the Earth turns, giving us day and night.', ['Earth', 'Sun', 'day', 'night', 'turn']),
    t(3, 'Animals and their homes', 'Match animals to where they live and explain why.', ['habitat', 'nest', 'burrow', 'shelter']),
    t(4, 'Caring for the environment', 'Explain how reducing, reusing and recycling help the environment.', ['recycle', 'reuse', 'litter', 'environment']),
  ],
  'Grade 4': [
    t(1, 'Who I am', 'Describe their strengths and how they can grow them.', ['strength', 'self', 'grow', 'respect']),
    t(2, 'Personal hygiene and health', 'Explain healthy habits and why they matter.', ['hygiene', 'germs', 'habit', 'health']),
    t(3, 'Rights and responsibilities', 'Link a child’s right to a matching responsibility.', ['right', 'responsibility', 'fair', 'respect']),
    t(4, 'Safety at home and on the road', 'Identify dangerous situations and how to stay safe.', ['danger', 'safe', 'emergency', 'help']),
  ],
}

const NST_G4 = [
  t(1, 'Living and non-living things', 'Sort things into living and non-living using the life processes.', ['living', 'non-living', 'grow', 'breathe', 'reproduce']),
  t(1, 'What plants need to grow', 'Describe what plants need to grow and test one need.', ['plant', 'water', 'light', 'soil', 'grow']),
  t(1, 'Habitats of animals', 'Explain how a habitat gives animals food, water and shelter.', ['habitat', 'shelter', 'food', 'water', 'adapt']),
  t(2, 'Solids, liquids and gases', 'Sort materials into solids, liquids and gases and describe how they behave.', ['solid', 'liquid', 'gas', 'shape', 'flow']),
  t(2, 'Strengthening materials', 'Investigate how folding and rolling paper makes it stronger.', ['strong', 'fold', 'roll', 'structure']),
  t(3, 'Energy and energy transfer', 'Explain that living things need energy from food, and the energy comes from the Sun.', ['energy', 'food', 'Sun', 'transfer']),
  t(3, 'Energy and sound', 'Show that sound is made by vibrations.', ['sound', 'vibrate', 'loud', 'soft', 'pitch']),
  t(4, 'Planet Earth and the Sun', 'Describe how the Earth moves around the Sun and why we have day and night.', ['Earth', 'Sun', 'orbit', 'rotate', 'day']),
  t(4, 'The Moon', 'Describe the Moon and how it seems to change shape.', ['Moon', 'phase', 'crater', 'orbit']),
]

const SS_G4 = [
  t(1, 'Places where people live', 'Describe the place where they live and how people use land.', ['settlement', 'village', 'town', 'land use']),
  t(1, 'Local history', 'Find out about the history of their area by asking older people.', ['history', 'source', 'interview', 'past']),
  t(2, 'Map skills', 'Use a simple map with a key, symbols and compass directions.', ['map', 'key', 'symbol', 'north', 'grid']),
  t(2, 'Learning from leaders', 'Describe what makes a good leader using a South African example.', ['leader', 'qualities', 'community', 'example']),
  t(3, 'Food and farming in South Africa', 'Explain how food gets from the farm to our table.', ['farm', 'crop', 'livestock', 'market']),
  t(3, 'Transport through time', 'Compare transport in the past and today.', ['transport', 'past', 'present', 'change']),
  t(4, 'Water in South Africa', 'Explain where our water comes from and why we must save it.', ['water', 'river', 'dam', 'save', 'pollution']),
  t(4, 'Communication through time', 'Compare how people communicated long ago and today.', ['communication', 'message', 'past', 'technology']),
]

const TOPICS = {
  Mathematics: MATHS,
  'Home Language': HOME_LANGUAGE,
  'First Additional Language': FAL,
  'Life Skills': LIFE_SKILLS,
  'Natural Sciences and Technology': { 'Grade 4': NST_G4 },
  'Social Sciences': { 'Grade 4': SS_G4 },
}

export const capsTopics = (grade, subject) => TOPICS[subject]?.[grade] || []

// The current school term, from the usual South African public school calendar.
export function currentTerm(date = new Date()) {
  const m = date.getMonth() + 1
  const d = date.getDate()
  if (m < 4 || (m === 4 && d < 8)) return 1
  if (m < 7) return 2
  if (m < 10) return 3
  return 4
}
