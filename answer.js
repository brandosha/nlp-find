var stopwords = [ "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had", "has", "have", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "it", "it's", "its", "itself", "let's", "me", "more", "most", "my", "myself", "nor", "of", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "she'd", "she'll", "she's", "should", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "we'd", "we'll", "we're", "we've", "were", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "would", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves" ]
var isStopword = { }
stopwords.map(stopword => isStopword[stopword] = true)

function sentenceSimilarities(sentence1, sentence2) {
  var sent1terms = sentence1.contractions().expand().all().terms()
  var sent2terms = sentence2.contractions().expand().all().terms()

  return sent1terms.map(term1 => {
    var word1 = term1.text('clean').replace(/[^a-z0-9]/, '')
    var bestTerm
    var bestSim = 0

    var word1vec = wordVecs[word1]
    sent2terms.some(term2 => {
      var word2 = term2.text('clean').replace(/[^a-z0-9]/, '')

      if (word2 === word1) {
        bestTerm = term2
        bestSim = 1

        return true
      }

      var word2vec = wordVecs[word2]

      var similarity = 0
      if (word1vec && word2vec) {
        similarity = Word2VecUtils.getCosSim(word1vec, word2vec)
      } else {
        similarity = stringSimilarity.compareTwoStrings(word1, word2)
      }

      if (similarity > bestSim) {
        bestTerm = term2
        bestSim = similarity
      }
    })

    return {
      term1,
      term2: bestTerm,
      score: bestSim
    }
  })
}

function findAnswer(question, answers) {
  question = nlp(question)
  answers = answers.map(text => nlp(text))

  var questionWord = question.matchOne('#QuestionWord').text('clean').replace(/[^a-z]/, '')
  var questionType
  if (questionWord === 'how' && question.has('how (much|many)')) {
    questionType = 'how much'
  } else if (questionWord === 'who' || questionWord === 'whom') {
    questionType = 'who'
  } else if (questionWord === 'when') {
    questionType = 'when'
  } else if (questionWord === 'where') {
    questionType = 'where'
  }

  var rankedAnswers = answers.map((answer, i) => {
    var similarities = sentenceSimilarities(question, answer)
    var weightData = []
    var weightedSim = similarities.reduce((prev, curr) => {
      var score = curr.score

      var weight = 0.5
      if (isStopword[curr.term1.text('clean').replace(/[^a-z]/, '')]) weight = 0.25
      else if (curr.term1.has('#Noun') || curr.term1.has('#Verb')) weight = 1

      weightData.push({
        text: curr.term1.text('clean'),
        match: curr.term2 ? curr.term2.text('clean') : undefined,
        score, weight
      })

      return prev + score * weight
    }, 0) / similarities.length

    var questionAnswerMult = 1
    if (questionType) {
      questionAnswerMult = 0.5
      if (questionType === 'how much' && answer.match('#Value').not('#Date').length > 0) {
        questionAnswerMult = 1
      } else if (questionType === 'who' && answer.has('#Person')) {
        questionAnswerMult = 1
      } else if (questionType === 'when' && answer.has('(#Time|#Date)')) {
        questionAnswerMult = 1
      } else if (questionType === 'where' && answer.has('#Place')) {
        questionAnswerMult = 1
      }
    }

    var score = weightedSim * questionAnswerMult

    return {
      index: i,
      score,
      weightData: {
        similarities: weightData,
        questionType,
        answerScore: questionAnswerMult 
      },
      text: answer.text()
    }
  })
  rankedAnswers.sort((a, b) => b.score - a.score)

  return rankedAnswers
}