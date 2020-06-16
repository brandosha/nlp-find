var stopwords = [ "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had", "has", "have", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "it", "it's", "its", "itself", "let's", "me", "more", "most", "my", "myself", "nor", "of", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "she'd", "she'll", "she's", "should", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "we'd", "we'll", "we're", "we've", "were", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "would", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves" ]
var isStopword = { }
stopwords.map(stopword => isStopword[stopword] = true)

var wordList = Object.keys(wordVecs)
var similarVecs = { }
var similarWords = { }
function getWordVec(word) {
  var vec = wordVecs[word] || similarVecs[word]

  var closestWord = word
  if (vec === undefined) {
    var bestSimilarity = 0

    wordList.forEach(vecWord => {
      var similarity = stringSimilarity.compareTwoStrings(word, vecWord)
      if (similarity > bestSimilarity) {
        closestWord = vecWord
        bestSimilarity = similarity
      }
    })

    if (bestSimilarity < 0.5) return undefined

    vec = wordVecs[closestWord]

    if (vec !== undefined) {
      similarVecs[word] = wordVecs[closestWord]
      similarWords[word] = {
        word: closestWord,
        similarity: bestSimilarity
      }
    }
  }
  
  return vec
}

var corefrenceProximity = 30

function createQADocument(text) {
  var original = nlp(text)
  var originalSentences = original.sentences()

  var document = original.clone()
  console.log(document.text('root'))

  var termIndices = {  }
  document.terms().forEach((term, i) => {
    termIndices[term.list[0].start] = i
  })

  function smartSimilarity(doc1, doc2) {
    var terms1 = doc1.terms()
    var terms2 = doc2.terms()

    var totalSimilarity = 0
    var comparedWords = 0
    var similarities = terms1.map(term1 => {
      var index1 = termIndices[term1.list[0].start]
      var word1 = term1.text('clean').replace(/[^a-z0-9]/, '')
      if (isStopword[word1]) return
      var vec1 = getWordVec(word1)

      var bestWord
      var bestSim = 0
      terms2.forEach(term2 => {
        var index2 = termIndices[term2.list[0].start]
        var word2 = term2.text('clean').replace(/[^a-z0-9]/, '')
        if (index1 === index2 || isStopword[word2]) return
        var vec2 = getWordVec(word2)

        var similarity = 0
        if (word1 === word2) {
          similarity = 1
        } if (vec1 && vec2) {
          similarity = cosSim(vec1, vec2)
        } else {
          similarity = stringSimilarity.compareTwoStrings(word1, word2)
        }

        if (similarity > bestSim) {
          bestWord = word2
          bestSim = similarity
        }
      })

      totalSimilarity += bestSim
      comparedWords++

      return { word1, bestWord, bestSim }
    })

    if (comparedWords === 0) var score = 0
    else var score = totalSimilarity / comparedWords

    return { similarities, score }
  }

  var nouns = document.nouns()
  nouns = nouns.map(nounDoc => {
    var index = termIndices[nounDoc.list[0].start]
    var noun = nounDoc.json()[0]
    
    var hasTag = { }
    var matchesPronoun = { }
    noun.terms.forEach(term => {
      term.tags.forEach(tag => {
        hasTag[tag] = true
        if (tag === 'Person' || tag === 'Plural') matchesPronoun['they'] = true
        if (tag === 'MaleName') matchesPronoun['he'] = true
        if (tag === 'FemaleName') matchesPronoun['she'] = true
      })
    })

    if (Object.keys(matchesPronoun).length === 0) matchesPronoun['it'] = true

    return {
      text: noun.text.toLowerCase().replace(/[^a-z ]/, ''),
      index,
      pronouns: matchesPronoun,
      tags: hasTag,
      origDoc: nounDoc
    }
  })

  document.pronouns().forEach(pronounDoc => {
    var index = termIndices[pronounDoc.list[0].start]
    var pronoun = pronounDoc.json()[0]
    var text = pronoun.text.toLowerCase().replace(/[^a-z ]/, '')
    pronoun = { text, index }

    var sentence = pronounDoc.sentence()

    var matchingNouns = []

    var bestMatchIndex = -1
    var bestMatchScore = 0

    nouns.forEach(noun => {
      if (noun.pronouns[text]) {
        var position = noun.index - pronoun.index
        if (position > 0) return
        if (Math.abs(position) > corefrenceProximity) return

        var similarity = smartSimilarity(noun.origDoc, sentence)
        if (similarity.score > bestMatchScore) {
          bestMatchScore = similarity.score
          bestMatchIndex = matchingNouns.length
        }

        matchingNouns.push({ position, noun, similarity })
      }
    })

    var bestMatch = matchingNouns[bestMatchIndex]
    if (bestMatch) {
      pronounDoc.replace(bestMatch.noun.text)
    }
  })

  function ask(question) {
    question = nlp(question)

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

    var answers = document.sentences().map((sentence, sentenceIndex) => {
      var similarity = smartSimilarity(question, sentence)

      var questionAnswerMult = 1
      if (questionType) {
        questionAnswerMult = 0.5

        if (questionType === 'how much' && sentence.match('#Value').not('#Date').length > 0) questionAnswerMult = 1
        else if (questionType === 'who' && sentence.has('#Person')) questionAnswerMult = 1
        else if (questionType === 'when' && sentence.has('(#Time|#Date)')) questionAnswerMult = 1
        else if (questionType === 'where' && sentence.has('#Place')) questionAnswerMult = 1
        else if (questionType === 'when' && sentence.has('#Cardinal')) questionAnswerMult = 0.75
        else if (
          (questionType === 'where' || questionType === 'who') && 
          sentence.has('#ProperNoun')
        ) questionAnswerMult = 0.75
      }

      var score = similarity.score * questionAnswerMult

      return {
        text: originalSentences.eq(sentenceIndex).text(),
        answerWeight: questionAnswerMult,
        questionType, score, similarity, sentenceIndex
      }
    })

    answers.sort((a, b) => b.score - a.score)

    return answers
  }

  return { ask }
}
