export function cleanReply(s: string): string {
  // scrobble.life ("---\n_Originally posted through [scrobble.life/...") and Lumen
  // ("---\n*Posted via Lumen*" or "---\n*Posted via Lumen by <user>*") both put a separator
  // right before their byline; drop it too (lookahead keeps unrelated horizontal rules),
  // otherwise the line filters below leave a dangling <hr> at the end of the post.
  const pre = s
    ? s.replace(
        /(^|\n)-{3,}[ \t]*\n+(?=[^\n]*(?:originally posted through \[scrobble\.life|\*posted via lumen))/i,
        '$1'
      )
    : s
  return (pre ? pre.split('\n')
    .filter(item => item.toLowerCase().includes('posted using [partiko') === false)
    .filter(item => item.toLowerCase().includes('posted using [dapplr') === false)
    .filter(item => item.toLowerCase().includes('posted using [leofinance') === false)
    .filter(item => item.toLowerCase().includes('posted via [neoxian') === false)
    .filter(item => item.toLowerCase().includes('posted using [neoxian') === false)
    .filter(item => item.toLowerCase().includes('posted via [first context') === false)
    .filter(item => item.toLowerCase().includes('posted with [stemgeeks') === false)
    .filter(item => item.toLowerCase().includes('posted using [bilpcoin') === false)
    .filter(item => item.toLowerCase().includes('posted using [inleo') === false)
    .filter(item => item.toLowerCase().includes('posted using [sportstalksocial]') === false)
    .filter(item => item.toLowerCase().includes('<center><sub>[posted using aeneas.blog') === false)
    .filter(item => item.toLowerCase().includes('<center><sub>posted via [proofofbrain.io') === false)
    .filter(item => item.toLowerCase().includes('<center>posted on [hypnochain') === false)
    .filter(item => item.toLowerCase().includes('<center><sub>posted via [weedcash.network') === false)
    .filter(item => item.toLowerCase().includes('<center>posted on [naturalmedicine.io') === false)
    .filter(item => item.toLowerCase().includes('<center><sub>posted via [musicforlife.io') === false)
    .filter(item => item.toLowerCase().includes('if the truvvl embed is unsupported by your current frontend, click this link to view this story') === false)
    .filter(item => item.toLowerCase().includes('<center><em>posted from truvvl') === false)
    .filter(item => item.toLowerCase().includes('view this post <a href="https://travelfeed.io/') === false)
    .filter(item => item.toLowerCase().includes('read this post on travelfeed.io for the best experience') === false)
    .filter(item => item.toLowerCase().includes('posted via <a href="https://www.dporn.co/"') === false)
    .filter(item => item.toLowerCase().includes('▶️ [watch on 3speak](https://3speak') === false)
    .filter(item => item.toLowerCase().includes('<sup><sub>posted via [inji.com]') === false)
    .filter(item => item.toLowerCase().includes('view this post on [liketu]') === false)
    .filter(item => {
      // Match the actual Liketu Speak boilerplate footer (both distinctive
      // parts) so a legitimate reply that merely mentions the phrase survives.
      const l = item.toLowerCase();
      return !(l.includes('posted from liketu speak') && l.includes('auto-transcrib'));
    })
    .filter(item => item.toLowerCase().includes('originally posted through [scrobble.life') === false)
    .filter(item => item.toLowerCase().includes('*posted via lumen') === false)
    .filter(item => item.toLowerCase().includes('[via Inbox]') === false)
    .filter(item => item.toLowerCase().includes('<sub>[via apps from](') === false)
    .join('\n') : '')
    .replace('Posted via <a href="https://d.buzz" data-link="promote-link">D.Buzz</a>', '')
    .replace('<div class="pull-right"><a href="/@hive.engage">![](https://i.imgur.com/XsrNmcl.png)</a></div>', '')
    .replace('<div><a href="https://engage.hivechain.app">![](https://i.imgur.com/XsrNmcl.png)</a></div>', '')
    .replace(`<div class="text-center"><img src="https://cdn.steemitimages.com/DQmNp6YwAm2qwquALZw8PdcovDorwaBSFuxQ38TrYziGT6b/A-20.png"><a href="https://bit.ly/actifit-app"><img src="https://cdn.steemitimages.com/DQmQqfpSmcQtfrHAtzfBtVccXwUL9vKNgZJ2j93m8WNjizw/l5.png"></a><a href="https://bit.ly/actifit-ios"><img src="https://cdn.steemitimages.com/DQmbWy8KzKT1UvCvznUTaFPw6wBUcyLtBT5XL9wdbB7Hfmn/l6.png"></a></div>`, '')
}
