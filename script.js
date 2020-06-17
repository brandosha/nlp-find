var promptInput = document.getElementById('prompt')
var questionInput = document.getElementById('question')
var output = document.getElementById('output')

promptInput.value = `
On May 3, 1901, downtown Jacksonville was ravaged by a fire that started as a kitchen fire. Spanish moss at a nearby mattress factory was quickly engulfed in flames and enabling the fire to spread rapidly. In just eight hours, it swept through 146 city blocks, destroyed over 2,000 buildings, left about 10,000 homeless and killed 7 residents. The Confederate Monument in Hemming Park was one of the only landmarks to survive the fire. Governor Jennings declare martial law and sent the state militia to maintain order. On May 17 municipal authority resumed in Jacksonville. It is said the glow from the flames could be seen in Savannah, Georgia, and the smoke plumes seen in Raleigh, North Carolina. Known as the "Great Fire of 1901", it was one of the worst disasters in Florida history and the largest urban fire in the southeastern United States. Architect Henry John Klutho was a primary figure in the reconstruction of the city. The first multi-story structure built by Klutho was the Dyal-Upchurch Building in 1902. The St. James Building, built on the previous site of the St. James Hotel that burned down, was built in 1912 as Klutho's crowning achievement.
`.trim()
questionInput.value = `
How much damage was caused by the fire?
`.trim()

var inputPrompt = promptInput.value
var qaDoc = createQADocument(inputPrompt)

function showAnswer() {
  var question = questionInput.value

  if (inputPrompt !== promptInput.value) {
    inputPrompt = promptInput.value
    qaDoc = createQADocument(inputPrompt)
  }

  var answers = qaDoc.ask(question)

  var maxScore = answers[0].score
  var sentences = Array(answers.length).fill(undefined)
  answers.forEach((answer, i) => {
    var newEl = document.createElement('span')
    var normScore = answer.score / maxScore
    newEl.style.background = `rgba(255, 255, 0, ${normScore * normScore})`
    if (i === 0) newEl.style.textDecoration = 'underline'
    newEl.innerText = answer.text + ' '
    sentences[answer.sentenceIndex] = newEl
  })

  output.innerHTML = ''
  sentences.forEach(sentEl => output.appendChild(sentEl))

  console.log(answers)
}
showAnswer()

try {
  navigator.serviceWorker.register('worker.js')
} catch (e) {
  console.error(e)
}