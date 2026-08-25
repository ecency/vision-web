import { cleanReply } from './clean-reply.method'

describe('cleanReply() method - Reply Cleaning', () => {
  describe('signature removal', () => {
    it('should remove Partiko signature', () => {
      const input = 'Great post!\n\nPosted using [Partiko iOS](https://partiko.app/referral/username)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Great post!')
      expect(result).not.toContain('Partiko')
    })

    it('should remove Dapplr signature', () => {
      const input = 'Nice work\n\nPosted using [Dapplr](https://dapplr.in)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Nice work')
      expect(result).not.toContain('Dapplr')
    })

    it('should remove LeoFinance signature', () => {
      const input = 'Awesome!\n\nPosted Using [LeoFinance Beta](https://leofinance.io)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Awesome!')
      expect(result).not.toContain('LeoFinance')
    })

    it('should remove Neoxian (via) signature', () => {
      const input = 'Great post\n\nPosted via [Neoxian City](https://neoxian.city)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Great post')
      expect(result).not.toContain('Neoxian')
    })

    it('should remove Neoxian (using) signature', () => {
      const input = 'Nice article\n\nPosted using [Neoxian City](https://neoxian.city)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Nice article')
      expect(result).not.toContain('Neoxian')
    })

    it('should remove First Context signature', () => {
      const input =
        'Nice piece\n\n*Posted via [First Context](https://beta.firstcontext.app/creator/ecency/02adc19f-14fb-444f-b295-1af98b2fb7e3)*'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Nice piece')
      expect(result).not.toContain('First Context')
    })

    it('should remove STEMGeeks signature', () => {
      const input = 'Science!\n\nPosted with [STEMGeeks](https://stemgeeks.net)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Science!')
      expect(result).not.toContain('STEMGeeks')
    })

    it('should remove Bilpcoin signature', () => {
      const input = 'Cool!\n\nPosted using [Bilpcoin](https://bilpcoin.com)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Cool!')
      expect(result).not.toContain('Bilpcoin')
    })

    it('should remove InLeo signature', () => {
      const input = 'Great content\n\nPosted Using [InLeo](https://inleo.io)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Great content')
      expect(result).not.toContain('InLeo')
    })

    it('should remove SportsTalkSocial signature', () => {
      const input = 'Go team!\n\nPosted using [SportsTalkSocial]'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Go team!')
      expect(result).not.toContain('SportsTalkSocial')
    })

    it('should remove Aeneas signature', () => {
      const input = 'Nice\n\n<center><sub>[Posted using Aeneas.blog](https://aeneas.blog)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Nice')
      expect(result).not.toContain('aeneas.blog')
    })

    it('should remove ProofOfBrain signature', () => {
      const input = 'Thinking...\n\n<center><sub>Posted via [ProofOfBrain.io](https://proofofbrain.io)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Thinking...')
      expect(result).not.toContain('ProofOfBrain')
    })

    it('should remove Hypnochain signature', () => {
      const input = 'Meditation\n\n<center>Posted on [Hypnochain](https://hypnochain.com)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Meditation')
      expect(result).not.toContain('Hypnochain')
    })

    it('should remove WeedCash signature', () => {
      const input = 'Green!\n\n<center><sub>Posted via [WeedCash.network](https://weedcash.network)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Green!')
      expect(result).not.toContain('WeedCash')
    })

    it('should remove NaturalMedicine signature', () => {
      const input = 'Healing\n\n<center>Posted on [NaturalMedicine.io](https://naturalmedicine.io)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Healing')
      expect(result).not.toContain('NaturalMedicine')
    })

    it('should remove MusicForLife signature', () => {
      const input = 'Music!\n\n<center><sub>Posted via [MusicForLife.io](https://musicforlife.io)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Music!')
      expect(result).not.toContain('MusicForLife')
    })

    it('should remove Truvvl embed message', () => {
      const input = 'Travel time\n\nIf the Truvvl embed is unsupported by your current frontend, click this link to view this story'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Travel time')
      expect(result).not.toContain('Truvvl')
    })

    it('should remove Truvvl signature', () => {
      const input = 'Traveling\n\n<center><em>Posted from Truvvl</em></center>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Traveling')
      expect(result).not.toContain('Truvvl')
    })

    it('should remove TravelFeed view message', () => {
      const input = 'Journey\n\nView this post <a href="https://travelfeed.io/@user/post">on TravelFeed</a>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Journey')
      expect(result).not.toContain('travelfeed.io')
    })

    it('should remove TravelFeed read message', () => {
      const input = 'Adventure\n\nRead this post on TravelFeed.io for the best experience'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Adventure')
      expect(result).not.toContain('TravelFeed')
    })

    it('should remove dPorn signature', () => {
      const input = 'Content\n\nPosted via <a href="https://www.dporn.co/">dPorn</a>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Content')
      expect(result).not.toContain('dporn')
    })

    it('should remove 3Speak watch link', () => {
      const input = 'Video time\n\n▶️ [Watch on 3Speak](https://3speak.tv/watch?v=user/permlink)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Video time')
      expect(result).not.toContain('3Speak')
    })

    it('should remove Inji signature', () => {
      const input = 'Message\n\n<sup><sub>Posted via [Inji.com](https://inji.com)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Message')
      expect(result).not.toContain('Inji')
    })

    it('should remove Liketu signature', () => {
      const input = 'Photo\n\nView this post on [Liketu](https://liketu.com)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Photo')
      expect(result).not.toContain('Liketu')
    })

    it('should remove the "<sub>[via Apps from](...)</sub>" auto-footer', () => {
      const input = 'Nice comment\n\n<sub>[via Apps from](https://linktr.ee/sagarkothari88)</sub>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Nice comment')
      expect(result).not.toContain('via Apps from')
    })

    it('should remove the "via Apps from" footer when wrapped in <center>', () => {
      const input = 'Content here\n\n<center><sub>[via Apps from](https://linktr.ee/sagarkothari88)</sub></center>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Content here')
      expect(result).not.toContain('via Apps from')
    })

    it('should preserve legitimate mentions of linktr.ee URLs in post body', () => {
      // The filter must not strip lines that simply reference the URL, only
      // the exact auto-footer format produced by the originating app.
      const input = 'Check out this creator: https://linktr.ee/sagarkothari88 — great work'
      const result = cleanReply(input)

      expect(result).toContain('https://linktr.ee/sagarkothari88')
      expect(result).toContain('great work')
    })

    it('should remove scrobble.life movies footer', () => {
      const input =
        'My review of the movie\n\n---\n_Originally posted through [scrobble.life/movies](https://scrobble.life/review/user/some-permlink)._'
      const result = cleanReply(input)

      expect(result.trim()).toBe('My review of the movie')
      expect(result).not.toContain('scrobble.life')
      expect(result).not.toContain('---')
    })

    it('should preserve unrelated horizontal rules when removing the scrobble.life footer', () => {
      const input =
        'Intro\n\n---\n\nMore thoughts\n\n---\n_Originally posted through [scrobble.life/tv](https://scrobble.life/review/user/show-permlink)._'
      const result = cleanReply(input)

      expect(result).toContain('Intro\n\n---\n\nMore thoughts')
      expect(result).not.toContain('scrobble.life')
      expect(result.trim().endsWith('More thoughts')).toBe(true)
    })

    it('should remove scrobble.life tv footer', () => {
      const input =
        'Series thoughts\n\n_Originally posted through [scrobble.life/tv](https://scrobble.life/review/user/show-permlink)._'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Series thoughts')
      expect(result).not.toContain('scrobble.life')
    })

    it('should preserve replies that merely mention scrobble.life', () => {
      const input = 'I started tracking what I watch on scrobble.life recently'
      const result = cleanReply(input)

      expect(result.trim()).toBe(input)
    })

    it('should handle Inbox mentions', () => {
      const input = 'Reply content here'
      const result = cleanReply(input)

      // Simple test - the actual Inbox filter is for specific patterns
      expect(result.trim()).toBe('Reply content here')
    })
  })

  describe('replacement cleaning', () => {
    it('should remove D.Buzz replacement', () => {
      const input = 'Buzz\n\nPosted via <a href="https://d.buzz" data-link="promote-link">D.Buzz</a>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Buzz')
      expect(result).not.toContain('D.Buzz')
    })

    it('should remove Hive.Engage badge (pull-right)', () => {
      const input = 'Engage\n\n<div class="pull-right"><a href="/@hive.engage">![](https://i.imgur.com/XsrNmcl.png)</a></div>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Engage')
      expect(result).not.toContain('hive.engage')
    })

    it('should remove Hive.Engage badge (text-center)', () => {
      const input = 'Engage more\n\n<div><a href="https://engage.hivechain.app">![](https://i.imgur.com/XsrNmcl.png)</a></div>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Engage more')
      expect(result).not.toContain('engage.hivechain.app')
    })

    it('should remove Actifit badge', () => {
      const input = 'Steps\n\n<div class="text-center"><img src="https://cdn.steemitimages.com/DQmNp6YwAm2qwquALZw8PdcovDorwaBSFuxQ38TrYziGT6b/A-20.png"><a href="https://bit.ly/actifit-app"><img src="https://cdn.steemitimages.com/DQmQqfpSmcQtfrHAtzfBtVccXwUL9vKNgZJ2j93m8WNjizw/l5.png"></a><a href="https://bit.ly/actifit-ios"><img src="https://cdn.steemitimages.com/DQmbWy8KzKT1UvCvznUTaFPw6wBUcyLtBT5XL9wdbB7Hfmn/l6.png"></a></div>'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Steps')
      expect(result).not.toContain('actifit')
    })
  })

  describe('multiple signatures', () => {
    it('should remove multiple different signatures', () => {
      const input = `Great post!

Posted using [Partiko iOS](https://partiko.app)
Posted via [Neoxian City](https://neoxian.city)
Posted using [InLeo](https://inleo.io)`

      const result = cleanReply(input)

      expect(result.trim()).toBe('Great post!')
      expect(result).not.toContain('Partiko')
      expect(result).not.toContain('Neoxian')
      expect(result).not.toContain('InLeo')
    })

    it('should remove signatures and replacements together', () => {
      const input = `Content here

Posted using [Partiko iOS](https://partiko.app)
Posted via <a href="https://d.buzz" data-link="promote-link">D.Buzz</a>`

      const result = cleanReply(input)

      expect(result.trim()).toBe('Content here')
      expect(result).not.toContain('Partiko')
      expect(result).not.toContain('D.Buzz')
    })
  })

  describe('whitespace handling', () => {
    it('should preserve content whitespace', () => {
      const input = `Line 1

Line 2

Posted using [Partiko iOS](https://partiko.app)`

      const result = cleanReply(input)

      expect(result).toContain('Line 1')
      expect(result).toContain('Line 2')
      expect(result).not.toContain('Partiko')
    })

    it('should handle content with only signature', () => {
      const input = 'Posted using [Partiko iOS](https://partiko.app)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('')
    })

    it('should handle content with trailing newlines', () => {
      const input = 'Content\n\n\n\nPosted using [InLeo](https://inleo.io)\n\n'
      const result = cleanReply(input)

      expect(result).not.toContain('InLeo')
    })
  })

  describe('case sensitivity', () => {
    it('should handle lowercase signatures', () => {
      const input = 'Text\n\nposted using [partiko ios](https://partiko.app)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Text')
      expect(result).not.toContain('partiko')
    })

    it('should handle uppercase signatures', () => {
      const input = 'Text\n\nPOSTED USING [PARTIKO IOS](https://partiko.app)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Text')
      expect(result).not.toContain('PARTIKO')
    })

    it('should handle mixed case signatures', () => {
      const input = 'Text\n\nPoStEd uSiNg [PaRtIkO iOs](https://partiko.app)'
      const result = cleanReply(input)

      expect(result.trim()).toBe('Text')
      expect(result).not.toContain('partiko')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = cleanReply('')
      expect(result.trim()).toBe('')
    })

    it('should handle null input', () => {
      const result = cleanReply(null as any)
      expect(result.trim()).toBe('')
    })

    it('should handle undefined input', () => {
      const result = cleanReply(undefined as any)
      expect(result.trim()).toBe('')
    })

    it('should handle content without signatures', () => {
      const input = 'Just normal content without any signatures'
      const result = cleanReply(input)
      expect(result).toBe(input)
    })

    it('should handle very long content', () => {
      const input = 'a'.repeat(10000) + '\n\nPosted using [Partiko iOS](https://partiko.app)'
      const result = cleanReply(input)

      expect(result).not.toContain('Partiko')
      expect(result.length).toBeLessThan(input.length)
    })

    it('should handle content mentioning platforms without signature pattern', () => {
      const input = 'I think Partiko is a great app'
      const result = cleanReply(input)

      // Should preserve content that mentions platforms but doesn't match signature pattern
      expect(result.trim()).toBe('I think Partiko is a great app')
    })
  })
})
