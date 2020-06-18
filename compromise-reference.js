(function(){

var reference = function(Doc, world, _nlp, Phrase, Term) {

  Term.prototype.descriptionFillerWord = function() {
    return !(
      this.tags['Noun'] === true ||
      this.tags['Verb'] === true
    )
  }

  Doc.prototype.referencing = function() {
    var docId = this.all().list[0].start
    var phrase = this.list[0]
    if (phrase === undefined) return new Doc([], this, world)
    var wordId = phrase.start

    var refData = reference.cache[docId]
    if (refData) {
      var tag
      if (this.has('#Adjective')) tag = 'adjectives'
      else if (this.has('#Verb')) tag = 'verbs'
      else if (this.has('#Pronoun')) tag = 'pronouns'
      else if (this.has('#Noun')) tag = 'nouns'
      else return new Doc([], this, world)

      var wordData = refData[tag][wordId]
      if (wordData && wordData.length === phrase.length) {
        var referenceOut = wordData.reference
        if (referenceOut === null) return new Doc([], this, world)

        var innerReference = referenceOut.referencing()
        if (innerReference.found) return innerReference
        else return new Doc(referenceOut.list, this, world)
      }
    }

    return new Doc([], this, world)
  }

  Doc.prototype.referencedBy = function() {
    var docId = this.all().list[0].start
    var phrase = this.list[0]
    if (phrase === undefined) return new Doc([], this, world)
    var wordId = phrase.start

    var refData = reference.cache[docId]
    if (refData) {
      var tag
      if (this.has('#Pronoun')) tag = 'pronouns'
      else if (this.has('#Noun')) tag = 'nouns'
      else return new Doc([], this, world)

      var wordData = refData[tag][wordId]
      if (wordData && wordData.length === phrase.length) return new Doc(wordData.descriptions, this, world)
    }

    return new Doc([], this, world)
  }

  Doc.prototype.clearReferenceCache = function() {
    var docId = this.all().list[0].start
    delete reference.cache[docId]
  }

  world.postProcess(doc => {
    doc.text('root') // This seems to be the only way to cache the root words. Probably a bug.

    var docId = doc.list[0].start

    var cache = {
      nouns: { },
      pronouns: { },
      adjectives: { },
      verbs: { }
    }
    reference.cache[docId] = cache

    var wordIndices = { }
    cache.wordIndices = wordIndices

    var words = doc.termList()
    cache.words = words

    words.forEach((term, i) => wordIndices[term.id] = i)
    function getWordIndex(term) {
      return wordIndices[term.list[0].start]
    }

    var nounIds = []
    doc.nouns().forEach(noun => {
      var id = noun.list[0].start
      var length = noun.list[0].length
      var index = wordIndices[id]

      nounIds.push(id)

      var matchesPronoun = { }
      var primaryPronoun

      var terms = noun.termList()
      terms.forEach(term => {
        var tags = term.tags
        if (tags['Person'] || tags['Plural']) {
          matchesPronoun['they'] = true
          if (!['they', 'he', 'she'].includes(primaryPronoun)) primaryPronoun = 'they'
        }
        if (tags['MaleName']) {
          matchesPronoun['he'] = true
          primaryPronoun = 'he'
        }
        if (tags['FemaleName']) {
          matchesPronoun['she'] = true
          primaryPronoun = 'she'
        }
      })
      if (Object.keys(matchesPronoun).length === 0) {
        matchesPronoun['it'] = true
        primaryPronoun = 'it'
      }

      var nounVector = Array(300).fill(0)
      var usedPrimary = false
      var usedOnlyPrimary = true
      terms.forEach(term => {
        var vec = wordVec(term)
        if (vec === undefined) {
          if (usedPrimary || !term['ProperNoun']) return

          vec = wordVecs[primaryPronoun]
          usedPrimary = true
        } else usedOnlyPrimary = false

        nounVector.forEach((_, i) => {
          nounVector[i] += vec[i]
        })
      })

      var vector
      if (usedOnlyPrimary) vector = null
      else if (terms.length > 1) vector = new Vector(nounVector.map(v => v / terms.length))
      else vector = new Vector(nounVector)
      
      cache.nouns[id] = {
        length, index, matchesPronoun, vector,
        doc: noun,
        descriptions: [],
        reference: null
      }
    })

    var pronounIds = []
    doc.pronouns().forEach(pronoun => {
      var id = pronoun.list[0].start
      var length = pronoun.list[0].length
      var index = wordIndices[id]

      pronounIds.push(id)

      cache.pronouns[id] = {
        length, index,
        doc: pronoun,
        descriptions: [],
        reference: null
      }
    })

    function getFullNoun(nounPart) {
      var fullNoun = null

      var partId = nounPart.list[0].start
      var partIndex = wordIndices[partId]

      var pronoun = cache.pronouns[partId]
      var noun = cache.nouns[partId]
      if (pronoun) {
        fullNoun = pronoun
      } else if (noun) fullNoun = noun
      else {
        var nounInList = nounIds.some(id => {
          var noun = cache.nouns[id]
          var start = noun.index
          var end = start + noun.length

          if (partIndex >= start && partIndex <= end) {
            fullNoun = noun
            return true
          }
        })

        if (!nounInList) fullNoun = null
      }

      return fullNoun
    }

    function getDescriptionSubject(descTerm) {
      var id = descTerm.list[0].start
      var length = descTerm.list[0].length
      var index = wordIndices[id]

      var noun = {
        ahead: descTerm.lookAhead('#Noun').first(),
        behind: descTerm.lookBehind('#Noun').last()
      }

      var reference = null

      if (noun.ahead.found) {
        var nounIndex = getWordIndex(noun.ahead)
        if (nounIndex === index + length) reference = noun.ahead
        else {
          var invalidWord = false
          for (let i = index + length; i < nounIndex; i++) {
            var wordBetween = words[i]
            if (!(
              wordBetween.tags['Adjective'] ||
              wordBetween.tags['Verb'] || 
              wordBetween.tags['Determiner'] ||
              wordBetween.clean === 'and'
            )) {
              invalidWord = true
              break
            }
          }

          if (!invalidWord) reference = noun.ahead
        }
      }

      if (reference === null && noun.behind.found) reference = noun.behind

      if (reference) {
        var fullNoun = getFullNoun(reference)
        reference = fullNoun.doc
        fullNoun.descriptions.push(descTerm)
      }

      return reference
    }

    doc.adjectives().forEach(adjective => {
      var id = adjective.list[0].start
      var length = adjective.list[0].length
      var reference = getDescriptionSubject(adjective)

      cache.adjectives[id] = {
        doc: adjective,
        length, reference
      }
    })

    doc.verbs().forEach(verb => {
      var id = verb.list[0].start
      var length = verb.list[0].length
      var reference = getDescriptionSubject(verb)

      cache.verbs[id] = {
        doc: verb,
        length, reference
      }
    })

    var pronounReferences = doc.match('[#Pronoun] #Copula @descriptionFillerWord+? [#Noun]')
    pronounReferences.forEach(match => {
      var pronoun = match.group(0)
      var noun = match.group(1)

      if (pronoun.found) pronoun = getFullNoun(pronoun)
      if (noun.found) noun = getFullNoun(noun)

      if (noun.doc && pronoun.doc) {
        pronoun.descriptions.push(noun.doc)
        noun.reference = pronoun.doc
      }
    })

    pronounIds.forEach(pronounId => {
      var pronoun = cache.pronouns[pronounId]
      var pronounText = pronoun.doc.text('clean').replace(/[^a-z]/, '')

      if (pronoun.descriptions.length === 0) return

      var descriptionTerms = []
      var descriptionVectors = []
      pronoun.descriptions.forEach(desc => {
        desc.termList().forEach(term => {
          var vec = wordVec(term)
          if (vec) {
            descriptionVectors.push(new Vector(vec))
            descriptionTerms.push(term)
          }
        })
      })

      var bestNoun = null
      var bestSim = 0

      nounIds.forEach(nounId => {
        var noun = cache.nouns[nounId]
        var nounVec = noun.vector
        
        if (
          nounVec === null ||
          noun.index > pronoun.index || 
          !noun.matchesPronoun[pronounText]
        ) return

        var totalSim = 0
        descriptionVectors.forEach(vec => {
          totalSim += vec.cosSim(nounVec)
        })

        if (totalSim > bestSim) {
          bestNoun = noun.doc
          bestSim = totalSim
        }
      })

      pronoun.reference = bestNoun
    })

    // console.log(doc.text(), cache)
  })

}
reference.cache = { }

function Vector(arr) {
  this.value = arr
}

Vector.prototype.mag = function() {
  return Math.sqrt(this.value.reduce(function(sum, val) {
    return sum + val * val;
  }, 0));
}

Vector.prototype.dot = function(v2) {
  return this.value.reduce(function(sum, a, idx) {
    return sum + a * v2.value[idx];
  }, 0)
}

Vector.prototype.cosSim = function(v2) {
  return Math.abs(this.dot(v2)) / (this.mag() * v2.mag())
}

function wordVec(term) {
  return wordVecs[term.clean] || wordVecs[term.reduced] || wordVecs[term.root]
}

nlp = nlp.extend(reference)

}())

var ambiguousIt1 = nlp('The rabbit didn\'t cross the road because it was too wide.')
var ambiguousIt2 = nlp('The rabbit didn\'t cross the road because it was too tired.')

console.log(ambiguousIt1.text(), ambiguousIt1.matchOne('#Pronoun').referencing().text())
console.log(ambiguousIt2.text(), ambiguousIt2.matchOne('#Pronoun').referencing().text())

console.time('parse prompt')
var mainDoc = nlp(inputPrompt)
console.timeEnd('parse prompt')

mainDoc.pronouns().forEach(pronoun => {
  var ref = pronoun.referencing()
  if (ref) ref = ref.text()
  console.log(pronoun.sentence().text(), pronoun.text(), ref)
})