import { getTestData } from './test/data'
import { markdown2Html } from './markdown-2-html'

const fs = require('fs')
const path = require('path')
const SNAPSHOT_JSON = {
  "markdown_2_html_test_files_1_should_catch_images_in_table": "<p dir=\"auto\"><span>Congratulations <a class=\"markdown-author-link\" data-author=\"dunsky\">@dunsky</a>! You have completed the following achievement on the Steem blockchain and have been rewarded with new badge(s) :</span></p>\n<table><tr><td><span><img class=\"markdown-img-link\" src=\"https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnWxBVz6r6Lv5n7t2RYBogkr5EjvnLjk?format=match&amp;mode=fit\" loading=\"eager\" fetchpriority=\"high\" itemprop=\"image\" srcset=\"https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnWxBVz6r6Lv5n7t2RYBogkr5EjvnLjk?format=match&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnWxBVz6r6Lv5n7t2RYBogkr5EjvnLjk?format=match&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnWxBVz6r6Lv5n7t2RYBogkr5EjvnLjk?format=match&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnWxBVz6r6Lv5n7t2RYBogkr5EjvnLjk?format=match&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnWxBVz6r6Lv5n7t2RYBogkr5EjvnLjk?format=match&amp;mode=fit&amp;width=1280 1280w\" sizes=\"(max-width: 768px) 100vw, 700px\" /></span></td><td>You made more than 6000 upvotes. Your next target is to reach 7000 upvotes.</td></tr>\n<tr><td><span><img class=\"markdown-img-link\" src=\"https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnVKjKxTD5Xwi6jJqBW9PAmtMWvTCvPF?format=match&amp;mode=fit\" loading=\"eager\" itemprop=\"image\" decoding=\"async\" srcset=\"https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnVKjKxTD5Xwi6jJqBW9PAmtMWvTCvPF?format=match&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnVKjKxTD5Xwi6jJqBW9PAmtMWvTCvPF?format=match&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnVKjKxTD5Xwi6jJqBW9PAmtMWvTCvPF?format=match&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnVKjKxTD5Xwi6jJqBW9PAmtMWvTCvPF?format=match&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/9RTqgyyu8sX2kxvHt3ueNhDJEActwvqfV9wXt7pGKpjnVKjKxTD5Xwi6jJqBW9PAmtMWvTCvPF?format=match&amp;mode=fit&amp;width=1280 1280w\" sizes=\"(max-width: 768px) 100vw, 700px\" /></span></td><td>You published more than 250 posts. Your next target is to reach 300 posts.</td></tr>\n</table>\n<p dir=\"auto\"><sub><em><a class=\"markdown-external-link\" data-href=\"https://steemitboard.com/@dunsky\">Click here to view your Board of Honor</a></em></sub><br />\n<sub><em>If you no longer want to receive notifications, reply to this comment with the word</em> <code>STOP</code></sub></p>\n<p dir=\"auto\">To support your work, I also upvoted your post!</p>\n<blockquote>\n<p dir=\"auto\">Support <a class=\"markdown-external-link\" data-href=\"https://steemit.com/@steemitboard\">SteemitBoard's project</a>! <strong><a class=\"markdown-external-link\" data-href=\"https://v2.steemconnect.com/sign/account-witness-vote?witness=steemitboard&amp;approve=1\">Vote for its witness</a></strong> and <strong>get one more award</strong>!</p>\n</blockquote>",
  "markdown_2_html_test_files_3_should_replace_busy_links_properly": "<p dir=\"auto\"><img src=\"https://.esteem.app/0x0/https://ipfs.busy.org/ipfs/QmPziJCkx8w62UZCz1TNxAMsgf1uTnPZdVKAYjLBWvMzeD\" alt=\"image.png\" /></p>\n<p dir=\"auto\"><a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-1-2\">Part 1 - 2</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-3\">Part 3</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-4\">Part 4</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-5\">Part 5</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-6\">Part 6</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-7\">Part 7</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-8\">Part 8</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-9\">Part 9</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-10\">Part 10</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-11\">Part 11</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-12\">Part 12</a></p>\n<p dir=\"auto\"><strong>Part 13</strong></p>\n<p dir=\"auto\">Members of the Yerşehir caravan have surrendered their weapons to imperial soldiers at the entrance of Istanbul by the agreement provided earlier. The imperial soldiers arrested them immediately after the surrender of the weapons, and they entered the city with their hands chained.</p>\n<p dir=\"auto\">“The Yerşehir administration will ask you the account of this disrespect,” said Tamra to the proud Commander Timor on the pony. Tamra was angry because an ordinary soldier pushed her.</p>\n<p dir=\"auto\">\"You should be thankful we didn't strip you naked and had you wandering the streets of the city,\" said Commander Timor.</p>\n<p dir=\"auto\">Doma turned to the commander and said, “That's not how we dealt with you. Still, I assume you're doing your duty. I ask you to inform your superiors as soon as possible.”</p>\n<p dir=\"auto\">”You may be executed for armed entry into the Imperial lands,\" said the commander.</p>\n<p dir=\"auto\">“You like to dramatize things,” Akman said. Although Commander Timor was angry with Akman's happy face, he chose to keep the sarcastic look on his face.</p>\n<p dir=\"auto\">When he was taken to the dungeon, Akman was watching the buildings on the road, the squares adorned with sculptures, statues, and facades reflecting the beauty of East Roman stone craftsmanship.</p>\n<p dir=\"auto\">After passing the Hippodrome, which is one of the rare works of the ancient world, they entered a narrow tunnel and went down a ladder descending by turning. The soldiers locked them in a large gallery and returned. The water was dripping from the high ceiling of the dungeon, and the air they breathed was quite damp. Akman saw two rats with the size of cats running to their holes, terrified by the sound of footsteps.</p>\n<p dir=\"auto\">”I don't think they're gonna keep us here for long,\" Akman said.</p>\n<p dir=\"auto\">Akman was wrong; they told stories to each other in the first few days while there was no authority to call and ask for them. One of the dungeon guards came once a day and left a cup of water and a disgusting wheat porridge in the cell. The amount of oatmeal brought by the guard was so small that it was even possible for them to starve if the situation went on like this.</p>\n<p dir=\"auto\">Akman was cheerful as if he was at the banquet table, not at the dungeon. His joy was so bizarre that the team members began to think he was out of his mind. As the days passed, he was weakened by malnutrition; his clothes were stained, and his face was blackened. Still, he didn't lose anything from his joy. When asked how it can be so enjoyable, he said, “peace and light are within us. Just let's call and find out.\"</p>\n<p dir=\"auto\">Days later, an officer finally appeared at the door of the dungeon. Now, even the sparkle in the eyes of Akman has been lost, and Doma was unable to get up from where he was sleeping because of his illness. “The emperor will meet with the two representatives of your choice in two days,” said Chlorus, who brought plenty of food with him. Chlorus was handling his business with care. He brought water and ash to the cell to make sure they didn't smell bad, and he arranged a basin for their clothes. After washing, a barber would cut off their hair and beard. When they talk to the emperor, they should not extend the word and that they should give satisfying answers to the questions asked.</p>\n<p dir=\"auto\">Akman and Doma were taken from prison by the guards to be brought to the emperor. They agreed to hold a reasonable discourse during the interview. They were ready to suffer the maltreatment for the well-being of their country. The Imperial Palace adjacent to the Hippodrome was quite magnificent. They couldn't retrieve their eyes from the mosaics on the floor, the tiles on the walls and the stained glass windows. They passed through the large gate of the palace and entered the inner courtyard, where they waited for a while and then came to the emperor's presence.</p>\n<p dir=\"auto\">Since Doma's disease has not passed yet, Akman was holding his arm. As a matter of fact, he hasn't been able to speak; he agreed to join the meeting to show The Emperor what a terrible treatment they had.</p>\n<p dir=\"auto\">As soon as Emperor Valens saw Doma, he noticed his discomfort and told the servants to bring him a chair to sit down.</p>\n<p dir=\"auto\">“You wanted to see me,” said the Emperor, sitting on a plain throne compared to the splendor of the palace.</p>\n<p dir=\"auto\">”In the name of my people, I share your sorrow,\" said Akman.</p>\n<p dir=\"auto\">The emperor looked at Akman with the eyes asking, \"what is it about?”</p>\n<p dir=\"auto\">“I think robots attack your stables,” Akman said. Doma, who saw the environment as blurry due to high fever, turned and looked at Akman with amazement.</p>\n<p dir=\"auto\">”Few people know that yet, \" said Emperor Valens. Akman heard the news from the two soldiers they encountered on the way to the dungeon; the soldiers thought others did not understand them because they were whispering. As the security of his country is concerned, Akman chose to transfer the incident to the emperor in a different manner.</p>\n<p dir=\"auto\">\"We came to Istanbul to warn you about this. When the imperial authorities said in the dungeon that we could finally come to your peace, I understood that the attack has occurred,” Akman said.</p>\n<p dir=\"auto\">“You speak our language very well,” said the emperor.</p>\n<p dir=\"auto\">“Master Doma is much better than me, I hoped he'd be able to talk, but I was wrong,\" Akman said.</p>\n<p dir=\"auto\">\"I give you my regards and my gratitude for showing us the grace of acceptance. Because of my illness, I beg forgiveness for the imperfections that I can handle,” Doma said.</p>\n<p dir=\"auto\">“I will ask without hesitation: what could we have done to draw the wrath of God upon us, and what should we do to be merciful to his forgiveness?”</p>\n<p dir=\"auto\">Akman did not tell the emperor that events had begun with Ordin rising to Earth. He didn't want him to think they were in charge of the activities. Moreover, there was no evidence that the attacks on the stables in Yerşehir and Istanbul were related to Ordin's action. It was more than three months ago, and it could have been a coincidence.</p>\n<p dir=\"auto\">“I do not think that what happened is related to any sin.”</p>\n<p dir=\"auto\">“Foreigners come to our city with magical weapons, and ten days later, such an attack is taking place. Is that a coincidence?”</p>\n<p dir=\"auto\">\"I suspect that your scientists have already studied our weapons and have partially solved their operational principles. I assure you, our weapons work in accordance with scientific rules. I don't know why we're being treated so hard in your country.”</p>\n<p dir=\"auto\">“Could it be because you closed your doors to our country with a unilateral decision you made two centuries ago? According to historical records, despite the insistence of our empire, we have not even been able to negotiate the matter.”</p>\n<p dir=\"auto\">“It was a great travesty that half of our people died because of the plague. But that's not a valid excuse. I think the decision we made on time was wrong. During the past, we have been deprived of the benefits that we can achieve mutually. Given that the tunnel system makes wars almost impossible, it is not reasonable for us to continue such a mistake,\" Akman said.</p>\n<p dir=\"auto\">“I haven't received a satisfactory answer to my questions yet?\" the emperor said, despite the tone of his voice, his eyes were warm to Akman.</p>\n<p dir=\"auto\">\"I have to admit I don't know the answer to your questions, even if it's embarrassing for a philosopher. We came to Istanbul to find the answer to this question together.”</p>\n<p dir=\"auto\">\"I want to learn the working principles and how to produce the weapons you bring with you. This is the only way we can initiate an equality-based relationship.”</p>\n<p dir=\"auto\">\"I am not authorized to make such a decision. But I don't think your offer will be rejected at a time when we need cooperation to defend our cities,\" Akman said.</p>\n<p dir=\"auto\">After the meeting with Emperor Valens, the Yerşehir delegation was removed from prison, their belongings were returned, and they were sent from Istanbul with a ceremony in accordance with diplomatic traditions.</p>\n<p dir=\"auto\">Image Source: pixabay.com</p>",
  "markdown_2_html_test_files_4_should_not_convert_markdown_links": "<p dir=\"auto\">lorem <a class=\"markdown-external-link\" data-href=\"https://i.ecency.com/0x0/https://d1vof77qrk4l5q.cloudfront.net/img/5752638e6965247789bc20cef34727263aaa41e1.png\">this error</a> ipsum</p>",
  "markdown_2_html_traversing_20_should_not_convert_markdown_links": "<p dir=\"auto\">lorem <a class=\"markdown-external-link\" data-href=\"https://i.ecency.com/0x0/https://d1vof77qrk4l5q.cloudfront.net/img/5752638e6965247789bc20cef34727263aaa41e1.png\">this error</a> ipsum</p>",
  "markdown_2_html_traversing_22_should_replace_busy_links_properly": "<p dir=\"auto\"><img src=\"https://i.ecency.com/p/7ohP4GDMGPrUMp8dW6yuJTR9MKNu8P8DCXDU9qmmhgT2GEFsgcwp6r41v9wnLUULgcVqE59AhpBJjFXHVP6KTGZbAszsNTZrVUY3?format=match&amp;mode=fit\" alt=\"image.png\" /></p>\n<p dir=\"auto\"><a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-1-2\">Part 1 - 2</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-3\">Part 3</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-4\">Part 4</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-5\">Part 5</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-6\">Part 6</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-7\">Part 7</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-8\">Part 8</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-9\">Part 9</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-10\">Part 10</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-11\">Part 11</a><br />\n<a class=\"markdown-post-link\" data-tag=\"post\" data-author=\"muratkbesiroglu\" data-permlink=\"sci-fi-novel-underground-city-part-12\">Part 12</a></p>\n<p dir=\"auto\"><strong>Part 13</strong></p>\n<p dir=\"auto\">Members of the Yerşehir caravan have surrendered their weapons to imperial soldiers at the entrance of Istanbul by the agreement provided earlier. The imperial soldiers arrested them immediately after the surrender of the weapons, and they entered the city with their hands chained.</p>\n<p dir=\"auto\">“The Yerşehir administration will ask you the account of this disrespect,” said Tamra to the proud Commander Timor on the pony. Tamra was angry because an ordinary soldier pushed her.</p>\n<p dir=\"auto\">\"You should be thankful we didn't strip you naked and had you wandering the streets of the city,\" said Commander Timor.</p>\n<p dir=\"auto\">Doma turned to the commander and said, “That's not how we dealt with you. Still, I assume you're doing your duty. I ask you to inform your superiors as soon as possible.”</p>\n<p dir=\"auto\">”You may be executed for armed entry into the Imperial lands,\" said the commander.</p>\n<p dir=\"auto\">“You like to dramatize things,” Akman said. Although Commander Timor was angry with Akman's happy face, he chose to keep the sarcastic look on his face.</p>\n<p dir=\"auto\">When he was taken to the dungeon, Akman was watching the buildings on the road, the squares adorned with sculptures, statues, and facades reflecting the beauty of East Roman stone craftsmanship.</p>\n<p dir=\"auto\">After passing the Hippodrome, which is one of the rare works of the ancient world, they entered a narrow tunnel and went down a ladder descending by turning. The soldiers locked them in a large gallery and returned. The water was dripping from the high ceiling of the dungeon, and the air they breathed was quite damp. Akman saw two rats with the size of cats running to their holes, terrified by the sound of footsteps.</p>\n<p dir=\"auto\">”I don't think they're gonna keep us here for long,\" Akman said.</p>\n<p dir=\"auto\">Akman was wrong; they told stories to each other in the first few days while there was no authority to call and ask for them. One of the dungeon guards came once a day and left a cup of water and a disgusting wheat porridge in the cell. The amount of oatmeal brought by the guard was so small that it was even possible for them to starve if the situation went on like this.</p>\n<p dir=\"auto\">Akman was cheerful as if he was at the banquet table, not at the dungeon. His joy was so bizarre that the team members began to think he was out of his mind. As the days passed, he was weakened by malnutrition; his clothes were stained, and his face was blackened. Still, he didn't lose anything from his joy. When asked how it can be so enjoyable, he said, “peace and light are within us. Just let's call and find out.\"</p>\n<p dir=\"auto\">Days later, an officer finally appeared at the door of the dungeon. Now, even the sparkle in the eyes of Akman has been lost, and Doma was unable to get up from where he was sleeping because of his illness. “The emperor will meet with the two representatives of your choice in two days,” said Chlorus, who brought plenty of food with him. Chlorus was handling his business with care. He brought water and ash to the cell to make sure they didn't smell bad, and he arranged a basin for their clothes. After washing, a barber would cut off their hair and beard. When they talk to the emperor, they should not extend the word and that they should give satisfying answers to the questions asked.</p>\n<p dir=\"auto\">Akman and Doma were taken from prison by the guards to be brought to the emperor. They agreed to hold a reasonable discourse during the interview. They were ready to suffer the maltreatment for the well-being of their country. The Imperial Palace adjacent to the Hippodrome was quite magnificent. They couldn't retrieve their eyes from the mosaics on the floor, the tiles on the walls and the stained glass windows. They passed through the large gate of the palace and entered the inner courtyard, where they waited for a while and then came to the emperor's presence.</p>\n<p dir=\"auto\">Since Doma's disease has not passed yet, Akman was holding his arm. As a matter of fact, he hasn't been able to speak; he agreed to join the meeting to show The Emperor what a terrible treatment they had.</p>\n<p dir=\"auto\">As soon as Emperor Valens saw Doma, he noticed his discomfort and told the servants to bring him a chair to sit down.</p>\n<p dir=\"auto\">“You wanted to see me,” said the Emperor, sitting on a plain throne compared to the splendor of the palace.</p>\n<p dir=\"auto\">”In the name of my people, I share your sorrow,\" said Akman.</p>\n<p dir=\"auto\">The emperor looked at Akman with the eyes asking, \"what is it about?”</p>\n<p dir=\"auto\">“I think robots attack your stables,” Akman said. Doma, who saw the environment as blurry due to high fever, turned and looked at Akman with amazement.</p>\n<p dir=\"auto\">”Few people know that yet, \" said Emperor Valens. Akman heard the news from the two soldiers they encountered on the way to the dungeon; the soldiers thought others did not understand them because they were whispering. As the security of his country is concerned, Akman chose to transfer the incident to the emperor in a different manner.</p>\n<p dir=\"auto\">\"We came to Istanbul to warn you about this. When the imperial authorities said in the dungeon that we could finally come to your peace, I understood that the attack has occurred,” Akman said.</p>\n<p dir=\"auto\">“You speak our language very well,” said the emperor.</p>\n<p dir=\"auto\">“Master Doma is much better than me, I hoped he'd be able to talk, but I was wrong,\" Akman said.</p>\n<p dir=\"auto\">\"I give you my regards and my gratitude for showing us the grace of acceptance. Because of my illness, I beg forgiveness for the imperfections that I can handle,” Doma said.</p>\n<p dir=\"auto\">“I will ask without hesitation: what could we have done to draw the wrath of God upon us, and what should we do to be merciful to his forgiveness?”</p>\n<p dir=\"auto\">Akman did not tell the emperor that events had begun with Ordin rising to Earth. He didn't want him to think they were in charge of the activities. Moreover, there was no evidence that the attacks on the stables in Yerşehir and Istanbul were related to Ordin's action. It was more than three months ago, and it could have been a coincidence.</p>\n<p dir=\"auto\">“I do not think that what happened is related to any sin.”</p>\n<p dir=\"auto\">“Foreigners come to our city with magical weapons, and ten days later, such an attack is taking place. Is that a coincidence?”</p>\n<p dir=\"auto\">\"I suspect that your scientists have already studied our weapons and have partially solved their operational principles. I assure you, our weapons work in accordance with scientific rules. I don't know why we're being treated so hard in your country.”</p>\n<p dir=\"auto\">“Could it be because you closed your doors to our country with a unilateral decision you made two centuries ago? According to historical records, despite the insistence of our empire, we have not even been able to negotiate the matter.”</p>\n<p dir=\"auto\">“It was a great travesty that half of our people died because of the plague. But that's not a valid excuse. I think the decision we made on time was wrong. During the past, we have been deprived of the benefits that we can achieve mutually. Given that the tunnel system makes wars almost impossible, it is not reasonable for us to continue such a mistake,\" Akman said.</p>\n<p dir=\"auto\">“I haven't received a satisfactory answer to my questions yet?\" the emperor said, despite the tone of his voice, his eyes were warm to Akman.</p>\n<p dir=\"auto\">\"I have to admit I don't know the answer to your questions, even if it's embarrassing for a philosopher. We came to Istanbul to find the answer to this question together.”</p>\n<p dir=\"auto\">\"I want to learn the working principles and how to produce the weapons you bring with you. This is the only way we can initiate an equality-based relationship.”</p>\n<p dir=\"auto\">\"I am not authorized to make such a decision. But I don't think your offer will be rejected at a time when we need cooperation to defend our cities,\" Akman said.</p>\n<p dir=\"auto\">After the meeting with Emperor Valens, the Yerşehir delegation was removed from prison, their belongings were returned, and they were sent from Istanbul with a ceremony in accordance with diplomatic traditions.</p>\n<p dir=\"auto\">Image Source: pixabay.com</p>",
  "markdown_2_html_traversing_54_should_highlight_code": "<pre><code><span class=\"ll-spc\">          </span><span class=\"ll-key\">def</span><span class=\"ll-spc\"> </span><span class=\"ll-nam\">factorial</span><span class=\"ll-pct\">(</span><span class=\"ll-nam\">n</span><span class=\"ll-pct\">)</span><span class=\"ll-pct\">:</span><span class=\"ll-spc\">\n            </span><span class=\"ll-com\"># a comment</span><span class=\"ll-spc\">\n            </span><span class=\"ll-key\">return</span><span class=\"ll-spc\"> </span><span class=\"ll-num\">1</span><span class=\"ll-spc\"> </span><span class=\"ll-key\">if</span><span class=\"ll-spc\"> </span><span class=\"ll-pct\">(</span><span class=\"ll-nam\">n</span><span class=\"ll-pct\">=</span><span class=\"ll-pct\">=</span><span class=\"ll-num\">1</span><span class=\"ll-spc\"> </span><span class=\"ll-key\">or</span><span class=\"ll-spc\"> </span><span class=\"ll-nam\">n</span><span class=\"ll-pct\">=</span><span class=\"ll-pct\">=</span><span class=\"ll-num\">0</span><span class=\"ll-pct\">)</span><span class=\"ll-spc\"> </span><span class=\"ll-key\">else</span><span class=\"ll-spc\"> </span><span class=\"ll-nam\">n</span><span class=\"ll-spc\"> </span><span class=\"ll-pct\">*</span><span class=\"ll-spc\"> </span><span class=\"ll-nam\">factorial</span><span class=\"ll-pct\">(</span><span class=\"ll-nam\">n</span><span class=\"ll-spc\"> </span><span class=\"ll-pct\">-</span><span class=\"ll-spc\"> </span><span class=\"ll-num\">1</span><span class=\"ll-pct\">)</span><span class=\"ll-spc\">\n          </span><span class=\"ll-str\">``</span><span class=\"ll-unk\">`</span><span class=\"ll-spc\">\n</span></code></pre>",
  "markdown_2_html_webp_support_should_render_images_in_match_format": `<p dir="auto">lorem ipsum <picture><source type="image/avif" srcset="https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=avif&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=avif&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=avif&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=avif&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=avif&amp;mode=fit&amp;width=1280 1280w" sizes="(max-width: 768px) 100vw, 700px" /><source type="image/webp" srcset="https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=webp&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=webp&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=webp&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=webp&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=webp&amp;mode=fit&amp;width=1280 1280w" sizes="(max-width: 768px) 100vw, 700px" /><img class="markdown-img-link" src="https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=match&amp;mode=fit" srcset="https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=match&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=match&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=match&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=match&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/3MxaK2JpEReqU81H1nFBxSKAkZogZBUfT91hoXso81QXz7g?format=match&amp;mode=fit&amp;width=1280 1280w" sizes="(max-width: 768px) 100vw, 700px" loading="eager" decoding="async" itemprop="image" fetchpriority="high" /></picture> dolor sit amet</p>`
}

describe('Markdown2Html', () => {
  describe('Traversing', () => {
    it('1- Should convert image links to img tag', () => {
      const input = {
        author: 'foo11',
        permlink: 'bar11',
        last_update: '2019-05-10T09:15:21',
        body: 'https://img.esteem.ws/bbq3ob1idy.png'
      }
      const expected = '<p dir=\"auto\"><img class="markdown-img-link" src="https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit" srcset="https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=1280 1280w" sizes="(max-width: 768px) 100vw, 700px" loading="lazy" decoding="async" itemprop="image" /></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('2- Should handle steemit links', () => {
      const input = {
        author: 'foo22',
        permlink: 'bar22',
        last_update: '2019-05-10T09:15:21',
        body: '<a href=\'https://steemit.com/esteem/@esteemapp/esteem-monthly-guest-curation-program-4\'>click here</a>'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-external-link" data-href="https://steemit.com/esteem/@esteemapp/esteem-monthly-guest-curation-program-4">click here</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('3- Should handle copied links', () => {
      const input = {
        author: 'foo33',
        permlink: 'bar33',
        last_update: '2019-05-10T09:15:21',
        body: '<a href=\'/esteem/@esteemapp/esteem-monthly-guest-curation-program-4\'>click here</a>'
      }
      const expected = '<p dir=\"auto\"><a class=\"markdown-post-link\" data-href=\"/esteem/@esteemapp/esteem-monthly-guest-curation-program-4\" data-is-inline=\"false\" data-tag=\"esteem\" data-author=\"esteemapp\" data-permlink=\"esteem-monthly-guest-curation-program-4\">click here</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('4- Should handle copied links', () => {
      const input = {
        author: 'foo34',
        permlink: 'bar34',
        last_update: '2019-05-10T09:15:21',
        body: '[click here](/esteem/@esteemapp/esteem-monthly-guest-curation-program-4)'
      }
      const expected = '<p dir=\"auto\"><a class=\"markdown-post-link\" data-href=\"/esteem/@esteemapp/esteem-monthly-guest-curation-program-4\" data-is-inline=\"false\" data-tag=\"esteem\" data-author=\"esteemapp\" data-permlink=\"esteem-monthly-guest-curation-program-4\">click here</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('5- Should handle youtube videos', () => {
      const input = {
        author: 'foo35',
        permlink: 'bar35',
        last_update: '2019-05-10T09:15:21',
        body: 'https://www.youtube.com/watch?v=qK3d1eoH-Qs'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-youtube" data-embed-src="https://www.youtube.com/embed/qK3d1eoH-Qs?autoplay=1" data-youtube="qK3d1eoH-Qs"><img class="no-replace video-thumbnail" itemprop="image" src="https://i.ecency.com/p/S5Eokt4BcQdk7EHeT1aYjzebg2hC7hkthT45eMZRVYW6mkGBWKemLWWzXbRhNG7Z3h1qjGS?format=match&amp;mode=fit" loading="eager" fetchpriority="high" /><span class="markdown-video-play"></span></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('6- Should handle vimeo videos', () => {
      const input = {
        author: 'foo36',
        permlink: 'bar36',
        last_update: '2019-05-10T09:15:21',
        body: 'https://vimeo.com/311983548'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-vimeo"><iframe frameborder="0" allowfullscreen="true" src="https://player.vimeo.com/video/311983548"></iframe></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('7- Should handle d.tube videos', () => {
      const input = {
        author: 'foo37',
        permlink: 'bar37',
        last_update: '2019-05-10T09:15:21',
        body: '<a href="https://d.tube/#!/v/scottcbusiness/g04n2bbp" title="This link will take you away from steemit.com"><img src="https://i.ecency.com/640x0/https://ipfs.io/ipfs/QmPhb9HA1gASFiNAUPFqMdSidTAj17L5SSoV3zbXUx8M7t"></a>'
      }
      const expected = '<p dir=\"auto\"><a title="This link will take you away from steemit.com" class="markdown-video-link markdown-video-link-dtube" data-embed-src="https://emb.d.tube/#!/scottcbusiness/g04n2bbp"><img class="no-replace video-thumbnail" itemprop="image" src="https://i.ecency.com/p/46aP2QbqUqBqwzwxM6L1P6uLNceBDDCM6xyDJFx6ANhENRd3gJWJH7TiVR91QZ1KBcdAdZruQE35PBpQ3jUvkNK4mJqZ?format=match&amp;mode=fit" loading="eager" fetchpriority="high" /><span class="markdown-video-play"></span></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('7.1- Should handle raw d.tube videos without thumbnail', () => {
      const input = {
        author: 'foo37.1',
        permlink: 'bar37.1',
        last_update: '2020-05-10T09:15:21',
        body: 'https://d.tube/#!/v/techcoderx/QmVdEYicJwiTxSk2U9ER1Yc8Rumb1Nek4KynqAYGyQs7ga'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-dtube" data-embed-src="https://emb.d.tube/#!/techcoderx/QmVdEYicJwiTxSk2U9ER1Yc8Rumb1Nek4KynqAYGyQs7ga"><span class="markdown-video-play"></span></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('7.2- Should handle raw d.tube videos different format', () => {
      const input = {
        author: 'foo37.2',
        permlink: 'bar37.2',
        last_update: '2020-05-10T09:15:21',
        body: 'https://d.tube/v/techcoderx/QmVdEYicJwiTxSk2U9ER1Yc8Rumb1Nek4KynqAYGyQs7ga'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-dtube" data-embed-src="https://emb.d.tube/#!/techcoderx/QmVdEYicJwiTxSk2U9ER1Yc8Rumb1Nek4KynqAYGyQs7ga"><span class="markdown-video-play"></span></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('9- Should handle witnesses links', () => {
      const input = {
        author: 'foo39',
        permlink: 'bar39',
        last_update: '2019-05-10T09:15:21',
        body: '<a href=\'https://hivesigner.com/sign/account-witness-vote?witness=talhasch\'>vote @talhasch</a>'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-witnesses-link" data-href="https://hivesigner.com/sign/account-witness-vote?witness=talhasch">vote @talhasch</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('10- External link', () => {
      const input = {
        author: 'foo40',
        permlink: 'bar40',
        last_update: '2019-05-10T09:15:21',
        body: 'click <a href=\'https://loremipsum.com/foo/bar.html\'>here</a> to visit'
      }
      const expected = '<p dir=\"auto\">click <a class="markdown-external-link" data-href="https://loremipsum.com/foo/bar.html">here</a> to visit</p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('11- Should remove empty iframes', () => {
      const input = {
        author: 'foo41',
        permlink: 'bar41',
        last_update: '2019-05-10T09:15:21',
        body: '<iframe></iframe> <code>some content</code>'
      }
      const expected = '<code>some content</code>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('12- Should handle youtube iframe embeds', () => {
      const input = {
        author: 'foo42',
        permlink: 'bar42',
        last_update: '2019-05-10T09:15:21',
        body: '<iframe width="560" height="315" src="https://www.youtube.com/embed/I3f9ixg59no?foo=bar&baz=000" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'
      }
      const expected = '<iframe src=\"https://www.youtube.com/embed/I3f9ixg59no\" frameborder=\"0\" allowfullscreen=\"allowfullscreen\"></iframe>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('13- Should handle vimeo iframe embeds', () => {
      const input = {
        author: 'foo43',
        permlink: 'bar43',
        last_update: '2019-05-10T09:15:21',
        body: '<iframe src="https://player.vimeo.com/video/311983548" width="640" height="360" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>'
      }
      const expected = '<iframe src="https://player.vimeo.com/video/311983548" frameborder="0" allowfullscreen="allowfullscreen"></iframe>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('14- Should handle twitch iframe embeds', () => {
      const input = {
        author: 'foo44',
        permlink: 'bar44',
        last_update: '2019-05-10T09:15:21',
        body: '<iframe src="https://player.twitch.tv/?channel=esl_csgo" frameborder="0" allowfullscreen="true" scrolling="no" height="378" width="620"></iframe>'
      }
      const expected = '<iframe src="https://player.twitch.tv/?channel=esl_csgo&amp;parent=ecency.com&amp;autoplay=false" frameborder="0" allowfullscreen="true"></iframe>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('15- Should handle soundcloud iframe embeds', () => {
      const input = {
        author: 'foo45',
        permlink: 'bar45',
        last_update: '2019-05-10T09:15:21',
        body: '<iframe width="100%" height="300" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/558749283&color=%23ff5500&auto_play=true&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"></iframe>'
      }
      const expected = '<iframe frameborder="no" src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/558749283&amp;auto_play=false&amp;hide_related=false&amp;show_comments=true&amp;show_user=true&amp;show_reposts=false&amp;visual=true"></iframe>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('16- Should replace placeholder for unsupported iframe sources', () => {
      const input = {
        author: 'foo46',
        permlink: 'bar46',
        last_update: '2019-05-10T09:15:21',
        body: '<iframe src="https://foobarbaz.com/132431212" ></iframe>'
      }
      const expected = '<div class="unsupported-iframe">(Unsupported https://foobarbaz.com/132431212)</div>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('17- Should replace author names with link for given string', () => {
      let input = {
        author: 'foo47',
        permlink: 'bar47',
        last_update: '2019-05-10T09:15:21',
        body: 'lorem ipsum @dolor sit amet'
      }
      let expected =
        '<p dir=\"auto\"><span>lorem ipsum <a class="markdown-author-link" data-author="dolor">@dolor</a> sit amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)

      input = {
        author: 'foo48',
        permlink: 'bar48',
        last_update: '2019-05-10T09:15:21',
        body: '@lorem ipsum @dolor sit amet'
      }
      expected =
        '<p dir=\"auto\"><span><a class="markdown-author-link" data-author="lorem">@lorem</a> ipsum <a class="markdown-author-link" data-author="dolor">@dolor</a> sit amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)


      input = {
        author: 'foo49',
        permlink: 'bar49',
        last_update: '2019-05-10T09:15:21',
        body: '@lorem @ipsum @dolor sit amet'
      }
      expected =
        '<p dir=\"auto\"><span><a class="markdown-author-link" data-author="lorem">@lorem</a> <a class="markdown-author-link" data-author="ipsum">@ipsum</a> <a class="markdown-author-link" data-author="dolor">@dolor</a> sit amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)


      input = {
        author: 'foo50',
        permlink: 'bar50',
        last_update: '2019-05-10T09:15:21',
        body: '@lorem @ipsum @dolor \n @sit amet'
      }
      expected =
        '<p dir=\"auto\"><span><a class="markdown-author-link" data-author="lorem">@lorem</a> <a class="markdown-author-link" data-author="ipsum">@ipsum</a> <a class="markdown-author-link" data-author="dolor">@dolor</a></span><br /><span>\n<a class="markdown-author-link" data-author="sit">@sit</a> amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)


      input = {
        author: 'foo51',
        permlink: 'bar51',
        last_update: '2019-05-10T09:15:21',
        body: '@lorem @ipsum @dolor \n @Sit amet'
      }
      expected =
        '<p dir=\"auto\"><span><a class="markdown-author-link" data-author="lorem">@lorem</a> <a class="markdown-author-link" data-author="ipsum">@ipsum</a> <a class="markdown-author-link" data-author="dolor">@dolor</a></span><br />\n@Sit amet</p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('18- Should replace tags with link for given string', () => {
      let input = {
        author: 'foo52',
        permlink: 'bar52',
        last_update: '2019-05-10T09:15:21',
        body: 'lorem ipsum #dolor sit amet'
      }
      let expected =
        '<p dir=\"auto\"><span>lorem ipsum <a class="markdown-tag-link" data-tag="dolor">#dolor</a> sit amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)

      input = {
        author: 'foo53',
        permlink: 'bar53',
        last_update: '2019-05-10T09:15:21',
        body: '#lorem ipsum #dolor sit amet'
      }
      expected =
        '<p dir=\"auto\"><span><a class="markdown-tag-link" data-tag="lorem">#lorem</a> ipsum <a class="markdown-tag-link" data-tag="dolor">#dolor</a> sit amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)

      input = {
        author: 'foo54',
        permlink: 'bar54',
        last_update: '2019-05-10T09:15:21',
        body: '#lorem #ipsum #dolor sit amet'
      }
      expected =
        '<p dir=\"auto\"><span><a class="markdown-tag-link" data-tag="lorem">#lorem</a> <a class="markdown-tag-link" data-tag="ipsum">#ipsum</a> <a class="markdown-tag-link" data-tag="dolor">#dolor</a> sit amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)

      input = {
        author: 'foo55',
        permlink: 'bar55',
        last_update: '2019-05-10T09:15:21',
        body: '#lorem #ipsum #dolor \n #sit amet'
      }
      expected =
        '<p dir=\"auto\"><span><a class="markdown-tag-link" data-tag="lorem">#lorem</a> <a class="markdown-tag-link" data-tag="ipsum">#ipsum</a> <a class="markdown-tag-link" data-tag="dolor">#dolor</a></span><br /><span>\n<a class="markdown-tag-link" data-tag="sit">#sit</a> amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)

      input = {
        author: 'foo56',
        permlink: 'bar56',
        last_update: '2019-05-10T09:15:21',
        body: '#lorem #ipsum #dolor \n #Sit amet'
      }
      expected =
        '<p dir=\"auto\"><span><a class="markdown-tag-link" data-tag="lorem">#lorem</a> <a class="markdown-tag-link" data-tag="ipsum">#ipsum</a> <a class="markdown-tag-link" data-tag="dolor">#dolor</a></span><br /><span>\n<a class="markdown-tag-link" data-tag="sit">#Sit</a> amet</span></p>'
      expect(markdown2Html(input)).toBe(expected)

      input = {
        author: 'foo57',
        permlink: 'bar57',
        last_update: '2019-05-10T09:15:21',
        body: 'you are #1'
      }
      expected = '<p dir=\"auto\">you are #1</p>'
      expect(markdown2Html(input)).toBe(expected)

      input = {
        author: 'foo58',
        permlink: 'bar58',
        last_update: '2019-05-10T09:15:21',
        body: 'you are #1 #steemit-promo'
      }
      expected =
        '<p dir=\"auto\"><span>you are #1 <a class="markdown-tag-link" data-tag="steemit-promo">#steemit-promo</a></span></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('19- Should replace both mentions and tags', () => {
      let input = {
        author: 'foo59',
        permlink: 'bar59',
        last_update: '2019-05-10T09:15:21',
        body: 'lorem ipsum #dolor sit @amet'
      }
      let expected =
        '<p dir=\"auto\"><span>lorem ipsum <a class="markdown-tag-link" data-tag="dolor">#dolor</a> sit <a class="markdown-author-link" data-author="amet">@amet</a></span></p>'
      expect(markdown2Html(input)).toBe(expected)

      input = {
        author: 'foo60',
        permlink: 'bar60',
        last_update: '2019-05-10T09:15:21',
        body: 'lorem ipsum @#dolor sit amet'
      }
      expected = '<p dir=\"auto\">lorem ipsum @#dolor sit amet</p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('20- Should not convert markdown links', () => {
      const input = {
        author: 'foo61',
        permlink: 'bar61',
        last_update: '2019-05-10T09:15:21',
        body: 'lorem [this error](https://i.ecency.com/0x0/https://d1vof77qrk4l5q.cloudfront.net/img/5752638e6965247789bc20cef34727263aaa41e1.png) ipsum'
      }
      expect(markdown2Html(input)).toBe(SNAPSHOT_JSON.markdown_2_html_test_files_4_should_not_convert_markdown_links)
    })

    it('21- Should add https prefix', () => {
      const input = {
        author: 'foo62',
        permlink: 'bar62',
        last_update: '2019-05-10T09:15:21',
        body: '<a href="foo">foo</a>'
      }
      expect(markdown2Html(input).trim()).toBe(
        '<p dir=\"auto\"><a class="markdown-external-link" data-href="https://foo">foo</a></p>'
      )
    })

    it('23- Test with not obj param', () => {
      expect(markdown2Html('<a href="foo">foo</a> lorem ipsum **dolor** sit amet').trim()).toBe(
        '<p dir=\"auto\"><a class="markdown-external-link" data-href="https://foo">foo</a> lorem ipsum <strong>dolor</strong> sit amet</p>'
      )
    })

    it('24- Should handle proposal vote links', () => {
      const input = {
        author: 'foo358',
        permlink: 'bar358',
        last_update: '2019-05-10T09:15:21',
        body: '[Approve](https://beta.hivesigner.com/sign/update-proposal-votes?proposal_ids=[39]&approve=true) [Unapprove](https://beta.hivesigner.com/sign/update-proposal-votes?proposal_ids=%5B41%5D&approve=false)'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-proposal-link" data-href="https://beta.hivesigner.com/sign/update-proposal-votes?proposal_ids=[39]&amp;approve=true" data-proposal="39">Approve</a> <a class="markdown-proposal-link" data-href="https://beta.hivesigner.com/sign/update-proposal-votes?proposal_ids=%5B41%5D&amp;approve=false" data-proposal="41">Unapprove</a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('25- Should handle twitch videos', () => {
      const input = {
        author: 'foo363',
        permlink: 'bar363',
        last_update: '2019-05-10T09:15:21',
        body: 'https://www.twitch.tv/steemspacely'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-twitch"><iframe frameborder="0" allowfullscreen="true" src="https://player.twitch.tv/?channel=steemspacely&amp;parent=ecency.com&amp;autoplay=false"></iframe></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('26- Should handle speak videos', () => {
      const input = {
        author: 'foo326',
        permlink: 'bar326',
        last_update: '2019-05-10T09:15:21',
        body: '[![](https://img.3speakcontent.online/xrhjxocx/post.png?v2)](https://3speak.online/watch?v=wehmoen/xrhjxocx)'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-speak" data-embed-src="https://play.3speak.tv/watch?v=wehmoen/xrhjxocx&amp;mode=iframe"><img class="no-replace video-thumbnail" itemprop="image" src="https://i.ecency.com/p/2ufhwNgM3qHKBGVeU2TMMqPBjdB17MRuf4Q7vGrmGMtTn6yFtvW3Lt9t5v1c3so7UFhWDYh9B?format=match&amp;mode=fit" loading="eager" fetchpriority="high" /><span class="markdown-video-play"></span></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('27- Should handle speak videos with different tld', () => {
      const input = {
        author: 'foo33399',
        permlink: 'bar32300',
        last_update: '2029-05-10T09:15:21',
        body: '[![](https://img.3speakcontent.co/blnmdkjt/post.png)](https://3speak.co/watch?v=theycallmedan/blnmdkjt) [Watch on 3Speak](https://3speak.co/watch?v=theycallmedan/blnmdkjt)'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-speak" data-embed-src="https://play.3speak.tv/watch?v=theycallmedan/blnmdkjt&amp;mode=iframe"><img class="no-replace video-thumbnail" itemprop="image" src="https://i.ecency.com/p/CQdwDW6BZfWWtctopKyTJuDRdBH4KXwm9ijE6sZXe5MveWF3nUu4zXXBFUau8NS?format=match&amp;mode=fit" loading="eager" fetchpriority="high" /><span class="markdown-video-play"></span></a> <a class="markdown-external-link" data-href="https://3speak.co/watch?v=theycallmedan/blnmdkjt">Watch on 3Speak</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('28 - Should handle peakd post links', () => {
      const input = {
        author: 'foo3343',
        permlink: 'bar3243',
        last_update: '2019-05-10T09:15:21',
        body: 'https://peakd.com/@demo/tests'
      }
      const expected = '<p dir=\"auto\"><br /><a class=\"markdown-post-link\" data-href=\"https://peakd.com/@demo/tests\" data-is-inline=\"true\" data-tag=\"post\" data-author=\"demo\" data-permlink=\"tests\">@demo/tests</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('29- Should handle youtu.be videos', () => {
      const input = {
        author: 'foo329',
        permlink: 'bar329',
        last_update: '2019-05-10T09:15:21',
        body: 'https://youtu.be/UuyS7YAkECA?t=295s'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-youtube" data-embed-src="https://www.youtube.com/embed/UuyS7YAkECA?autoplay=1" data-youtube="UuyS7YAkECA" data-start-time="295"><img class="no-replace video-thumbnail" itemprop="image" src="https://i.ecency.com/p/S5Eokt4BcQdk7EHeT1aYjzebg2hC7hkthT45eAMp88bZ44hfAQDm6BtJw2H53aq1Tpn1cu4?format=match&amp;mode=fit" loading="eager" fetchpriority="high" /><span class="markdown-video-play"></span></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('30- Should handle external similar post links', () => {
      const input = {
        author: 'foo300',
        permlink: 'bar300',
        last_update: '2019-05-10T09:15:21',
        body: '[Voice: the criteria for success or failure](https://app.voice.com/post/@lukestokes/voice-the-criteria-for-success-or-failure-1597453134-597)'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-external-link" data-href="https://app.voice.com/post/@lukestokes/voice-the-criteria-for-success-or-failure-1597453134-597">Voice: the criteria for success or failure</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('31- Should handle external similar post links', () => {
      const input = {
        author: 'foo331',
        permlink: 'bar331',
        last_update: '2019-05-10T09:15:21',
        body: '[Voice: the criteria for success or failure](https://app.voice.com/@lukestokes/voice-the-criteria-for-success-or-failure-1597453134-597)'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-external-link" data-href="https://app.voice.com/@lukestokes/voice-the-criteria-for-success-or-failure-1597453134-597">Voice: the criteria for success or failure</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('32 - Should handle whitelisted post links', () => {
      const input = {
        author: 'foo33435',
        permlink: 'bar32435',
        last_update: '2019-05-10T09:15:21',
        body: 'https://peakd.com/tag/@demo/tests and https://steemit.com/test/@demo/post'
      }
      const expected = '<p dir=\"auto\"><br /><a class=\"markdown-post-link\" data-href=\"https://peakd.com/tag/@demo/tests\" data-is-inline=\"true\" data-tag=\"tag\" data-author=\"demo\" data-permlink=\"tests\">@demo/tests</a> and <a class=\"markdown-external-link\" data-href=\"https://steemit.com/test/@demo/post\">https://steemit.com/test/@demo/post</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('32c - Should handle whitelisted post links with referral parameters', () => {
      const input = {
        author: 'foo33437',
        permlink: 'bar32437',
        last_update: '2019-05-10T09:15:21',
        body: 'Read related post: [Weekly Sacrament of Confession? | 3 Misconducts to Avoid!](https://ecency.com/hive-148441/@artgirl/weekly-sacrament-of-confession-or?referral=artgirl)'
      }
      const expected = '<p dir=\"auto\">Read related post: <a class=\"markdown-post-link\" data-href=\"https://ecency.com/hive-148441/@artgirl/weekly-sacrament-of-confession-or?referral=artgirl\" data-is-inline=\"false\" data-tag=\"hive-148441\" data-author=\"artgirl\" data-permlink=\"weekly-sacrament-of-confession-or\">Weekly Sacrament of Confession? | 3 Misconducts to Avoid!</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('32b - Should treat titled Hive links as inline', () => {
      const input = {
        author: 'foo33436',
        permlink: 'bar32436',
        last_update: '2019-05-10T09:15:21',
        body: '[Waves mobile app](https://ecency.com/hive-125125/@ecency/waves-mobile-app-update-explore "https://ecency.com/hive-125125/@ecency/waves-mobile-app-update-explore")'
      }
      const expected = '<p dir=\"auto\"><br /><a title=\"https://ecency.com/hive-125125/@ecency/waves-mobile-app-update-explore\" class=\"markdown-post-link\" data-href=\"https://ecency.com/hive-125125/@ecency/waves-mobile-app-update-explore\" data-is-inline=\"true\" data-tag=\"hive-125125\" data-author=\"ecency\" data-permlink=\"waves-mobile-app-update-explore\">Waves mobile app</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('33- Should handle whitelisted user links', () => {
      const input = {
        author: 'foo334352',
        permlink: 'bar324352',
        last_update: '2019-05-10T09:15:21',
        body: 'https://peakd.com/@demo and https://steemit.com/@demo123'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-author-link" data-author="demo">@demo</a> and <a class="markdown-external-link" data-href="https://steemit.com/@demo123">https://steemit.com/@demo123</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('34- Should handle ipfs links', () => {
      const input = {
        author: 'foo3493',
        permlink: 'bar3493',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link https://ipfs.io/ipfs/bafybeihbqfrcrbr6jkf77rdve3nbxjzkfgmeneaw2x5s43qdgpe26cha6q'
      }
      const expected = '<p dir=\"auto\">this is link <a data-href="https://ipfs.io/ipfs/bafybeihbqfrcrbr6jkf77rdve3nbxjzkfgmeneaw2x5s43qdgpe26cha6q" class="markdown-img-link"><img src="https://i.ecency.com/p/2923mN3pnd7PiPXAMdj9UuE6SsjvQJDHj5VpTTCNs3tkJu9JC9Pu9qXSi5Ys5PYtkaRx6ErTnFVzh1WQxWS45rvr6Q4rfUooAM242oyKeihwnx?format=match&amp;mode=fit" itemprop=\"image\" loading=\"eager\" fetchpriority=\"high\" srcset="https://i.ecency.com/p/2923mN3pnd7PiPXAMdj9UuE6SsjvQJDHj5VpTTCNs3tkJu9JC9Pu9qXSi5Ys5PYtkaRx6ErTnFVzh1WQxWS45rvr6Q4rfUooAM242oyKeihwnx?format=match&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/2923mN3pnd7PiPXAMdj9UuE6SsjvQJDHj5VpTTCNs3tkJu9JC9Pu9qXSi5Ys5PYtkaRx6ErTnFVzh1WQxWS45rvr6Q4rfUooAM242oyKeihwnx?format=match&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/2923mN3pnd7PiPXAMdj9UuE6SsjvQJDHj5VpTTCNs3tkJu9JC9Pu9qXSi5Ys5PYtkaRx6ErTnFVzh1WQxWS45rvr6Q4rfUooAM242oyKeihwnx?format=match&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/2923mN3pnd7PiPXAMdj9UuE6SsjvQJDHj5VpTTCNs3tkJu9JC9Pu9qXSi5Ys5PYtkaRx6ErTnFVzh1WQxWS45rvr6Q4rfUooAM242oyKeihwnx?format=match&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/2923mN3pnd7PiPXAMdj9UuE6SsjvQJDHj5VpTTCNs3tkJu9JC9Pu9qXSi5Ys5PYtkaRx6ErTnFVzh1WQxWS45rvr6Q4rfUooAM242oyKeihwnx?format=match&amp;mode=fit&amp;width=1280 1280w" sizes="(max-width: 768px) 100vw, 700px" /></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('34-1- Should detect # in ipfs links', () => {
      const input = {
        author: 'foo34936',
        permlink: 'bar34936',
        last_update: '2019-05-10T09:15:24',
        body: 'this is a link https://ipfs.io/ipfs/bafybeihbqfrcrbr6jkf77rdve3nbxjzkfgmeneaw2x5s43qdgpe26cha6q/#home'
      }
      const expected = '<p dir=\"auto\">this is a link <a class="markdown-external-link" data-href="https://ipfs.io/ipfs/bafybeihbqfrcrbr6jkf77rdve3nbxjzkfgmeneaw2x5s43qdgpe26cha6q/#home">https://ipfs.io/ipfs/bafybeihbqfrcrbr6jkf77rdve3nbxjzkfgmeneaw2x5s43qdgpe26cha6q/#home</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('35- Should handle twitter links', () => {
      const input = {
        author: 'foo3321',
        permlink: 'bar3321',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link https://twitter.com/DeWaarheid_/status/1320603494836015105'
      }
      const expected = '<p dir=\"auto\">this is link <blockquote class="twitter-tweet"><p dir="auto">https://twitter.com/DeWaarheid_/status/1320603494836015105</p>- <a class="markdown-external-link" data-href="https://twitter.com/DeWaarheid_/status/1320603494836015105">DeWaarheid_</a></blockquote></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('36- Should handle custom community links', () => {
      const input = {
        author: 'foo33210',
        permlink: 'bar33210',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link https://peakd.com/c/hive-106444/trending and markdown link [Manipulation Station](https://peakd.com/c/hive-122516/trending)'
      }
      const expected = '<p dir=\"auto\">this is link <a class="markdown-community-link" data-community="hive-106444" data-filter="trending">trending/hive-106444</a> and markdown link <a class="markdown-community-link" data-community="hive-122516" data-filter="trending">Manipulation Station</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('37- Should handle dapplr iframe', () => {
      const input = {
        author: 'foo332101',
        permlink: 'bar332101',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link <iframe src="https://cdn.dapplr.in/file/dapplr-videos/sandymeyer/pEm9SdqNYJ6vntQCAalWU6dNC9zegQVl.mp4" ></iframe>'
      }
      const expected = '<p dir=\"auto\">this is link <iframe src="https://cdn.dapplr.in/file/dapplr-videos/sandymeyer/pEm9SdqNYJ6vntQCAalWU6dNC9zegQVl.mp4" sandbox="allow-scripts allow-same-origin" frameborder="0" allowfullscreen="true"></iframe></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('38- Should handle lbry.tv iframe', () => {
      const input = {
        author: 'foo332102',
        permlink: 'bar332102',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link <iframe id="lbry-iframe" width="560" height="315" src="https://lbry.tv/$/embed/epic-drone-video-sunset-swiss/38f32ec6de375352512a01c37ec9ef5e7fc35958?r=4N4ga6kbnyKXLSUCHtyfF7zh57vvJwfu" allowfullscreen></iframe> '
      }
      const expected = '<p dir=\"auto\">this is link <iframe src="https://lbry.tv/$/embed/epic-drone-video-sunset-swiss/38f32ec6de375352512a01c37ec9ef5e7fc35958?r=4N4ga6kbnyKXLSUCHtyfF7zh57vvJwfu" allowfullscreen="allowfullscreen" frameborder="0"></iframe></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('39- Should form profile page sections with copied links', () => {
      const input = {
        author: 'foo054',
        permlink: 'bar054',
        last_update: '2019-05-21T09:19:21',
        body: '<a href=\'https://ecency.com/@good-karma/wallet\'>click here</a>'
      }
      const expected = '<p dir=\"auto\"><a href="https://ecency.com/@good-karma/wallet" class="markdown-profile-link">click here</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('40- Should handle archive.org iframe', () => {
      const input = {
        author: 'foo040',
        permlink: 'bar040',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link <iframe src="https://archive.org/embed/VoyagetothePlanetofPrehistoricWomen" width="640" height="480" frameborder="0" webkitallowfullscreen="true" mozallowfullscreen="true" allowfullscreen></iframe>'
      }
      const expected = '<p dir=\"auto\">this is link <iframe src="https://archive.org/embed/VoyagetothePlanetofPrehistoricWomen" frameborder="0" webkitallowfullscreen="true" mozallowfullscreen="true" allowfullscreen="allowfullscreen"></iframe></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('41- Should handle spotify link', () => {
      const input = {
        author: 'foo041',
        permlink: 'bar041',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link https://open.spotify.com/playlist/7JG1cEnaIT6CSzloyNI6tU?si=7MCcmFEZQCebLvzqehq81Q '
      }
      const expected = '<p dir=\"auto\">this is link <a class=\"markdown-audio-link markdown-audio-link-spotify\"><iframe frameborder=\"0\" allowfullscreen=\"true\" src=\"https://open.spotify.com/embed/playlist/7JG1cEnaIT6CSzloyNI6tU?si=7MCcmFEZQCebLvzqehq81Q\" sandbox=\"allow-scripts allow-same-origin allow-popups\"></iframe></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('42- Should handle spotify embed', () => {
      const input = {
        author: 'foo042',
        permlink: 'bar042',
        last_update: '2019-05-10T09:15:21',
        body: 'this is embed link <iframe src="https://open.spotify.com/embed/album/6AORtDjduMM3bupSWzbTSG" width="300" height="380" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe> '
      }
      const expected = '<p dir=\"auto\">this is embed link <iframe src=\"https://open.spotify.com/embed/album/6AORtDjduMM3bupSWzbTSG\" frameborder=\"0\" sandbox=\"allow-scripts allow-same-origin allow-popups\"></iframe></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('43 - Should handle dtube iframe', () => {
      const input = {
        author: 'foo343',
        permlink: 'bar343',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link <iframe width="560" height="315" src="https://emb.d.tube/#!/keepskating420/QmZyu5uPfm2wvEDJaSfCx9wwDBMEcDg5CoxbKKC2vjqubq" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'
      }
      const expected = '<p dir=\"auto\">this is link <iframe src="https://emb.d.tube/#!/keepskating420/QmZyu5uPfm2wvEDJaSfCx9wwDBMEcDg5CoxbKKC2vjqubq" frameborder="0" allowfullscreen="true" sandbox="allow-scripts allow-same-origin"></iframe></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('44 - Should handle vimm iframe', () => {
      const input = {
        author: 'foo344',
        permlink: 'bar344',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link <iframe width="640px" height="360px" src="https://www.vimm.tv/vandalgame/embed?autoplay=0" frameborder=0></iframe>'
      }
      const expected = '<p dir=\"auto\">this is link <iframe src="https://www.vimm.tv/vandalgame/embed?autoplay=0" frameborder="0" sandbox="allow-scripts allow-same-origin allow-popups" allowfullscreen="true"></iframe></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('45 - Should handle collection linking', () => {
      const input = {
        author: 'foo345',
        permlink: 'bar345',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link https://peakd.com/ccc/jarvie/one-week-roadtrip-to-all-5-utah-national-parks-and-more'
      }
      const expected = '<p dir=\"auto\">this is link <br /><a class=\"markdown-post-link\" data-href=\"https://peakd.com/ccc/jarvie/one-week-roadtrip-to-all-5-utah-national-parks-and-more\" data-is-inline=\"true\" data-tag=\"ccc\" data-author=\"jarvie\" data-permlink=\"one-week-roadtrip-to-all-5-utah-national-parks-and-more\">@jarvie/one-week-roadtrip-to-all-5-utah-national-parks-and-more</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('46 - Should handle copied md links', () => {
      const input = {
        author: 'foo346',
        permlink: 'bar346',
        last_update: '2019-05-10T09:15:21',
        body: '[click here](https://peakd.com/@praetoria-cartel/wallet) direct link https://peakd.com/@praetoria-cartel/posts'
      }
      const expected = '<p dir=\"auto\"><a href=\"https://ecency.com/@praetoria-cartel/wallet\" class=\"markdown-profile-link\">click here</a> direct link <a href=\"https://ecency.com/@praetoria-cartel/posts\" class=\"markdown-profile-link\">@praetoria-cartel/posts</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('47 - Should handle internal links', () => {
      const input = {
        author: 'foo347',
        permlink: 'bar347',
        last_update: '2019-05-10T09:15:21',
        body: 'for history refer to this fine post /@offgridlife/proofofbrain-golden-rule-do-to-others-what-you-want-them-to-do-to-you and while you are in the community'
      }
      const expected = '<p dir=\"auto\"><span>for history refer to this fine post <a class=\"markdown-post-link\" data-author=\"offgridlife\" data-tag=\"post\" data-permlink=\"proofofbrain-golden-rule-do-to-others-what-you-want-them-to-do-to-you\">@offgridlife/proofofbrain-golden-rule-do-to-others-what-you-want-them-to-do-to-you</a> and while you are in the community</span></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('48 - Should handle Bitchute links', () => {
      const input = {
        author: 'foo347',
        permlink: 'bar347',
        last_update: '2021-05-10T09:15:21',
        body: 'https://www.bitchute.com/video/DJJvTZQxMaNK/'
      }
      const expected = '<p dir=\"auto\"><a class=\"markdown-video-link markdown-video-link-bitchute\" data-embed-src=\"https://www.bitchute.com/embed/DJJvTZQxMaNK/\"><span class=\"markdown-video-play\"></span></a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('49 - Should handle Bitchute iframes', () => {
      const input = {
        author: 'foo349',
        permlink: 'bar349',
        last_update: '2021-05-10T09:15:49',
        body: '<iframe width="640" height="360" scrolling="no" frameborder="0" style="border: none;" src="https://www.bitchute.com/embed/DJJvTZQxMaNK/"></iframe>'
      }
      const expected = '<iframe frameborder=\"0\" src=\"https://www.bitchute.com/embed/DJJvTZQxMaNK/\"></iframe>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('50 - Should handle user slash link', () => {
      const input = {
        author: 'foo350',
        permlink: 'bar350',
        last_update: '2021-05-10T09:15:49',
        body: '<a href="/@hivesql"><img src="https://i.imgur.com/EPN8RW6.png"></a>'
      }
      const expected = '<p dir=\"auto\"><a class=\"markdown-author-link\" data-author=\"hivesql\"><img src=\"https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgn8gbL3c5wQPJF23G?format=match&amp;mode=fit\" itemprop=\"image\" loading=\"eager\" fetchpriority=\"high\" srcset=\"https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgn8gbL3c5wQPJF23G?format=match&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgn8gbL3c5wQPJF23G?format=match&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgn8gbL3c5wQPJF23G?format=match&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgn8gbL3c5wQPJF23G?format=match&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgn8gbL3c5wQPJF23G?format=match&amp;mode=fit&amp;width=1280 1280w\" sizes=\"(max-width: 768px) 100vw, 700px\" /></a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('51 - Should handle posts without tags internal link', () => {
      const input = {
        author: 'foo351',
        permlink: 'bar351',
        last_update: '2021-05-10T09:15:49',
        body: '<a href="/@demo/test">test post</a>'
      }
      const expected = '<p dir=\"auto\"><a class=\"markdown-post-link\" data-href=\"/@demo/test\" data-is-inline=\"false\" data-tag=\"post\" data-author=\"demo\" data-permlink=\"test\">test post</a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('52 - Should handle filtered tag link', () => {
      const input = {
        author: 'foo352',
        permlink: 'bar352',
        last_update: '2021-05-10T09:15:49',
        body: 'https://hive.blog/trending/books'
      }
      const expected = '<p dir=\"auto\"><a class=\"markdown-tag-link\" data-filter=\"trending\" data-tag=\"books\">/trending/books</a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('53 - Should handle filtered tag internal link', () => {
      const input = {
        author: 'foo353',
        permlink: 'bar353',
        last_update: '2021-05-10T09:15:49',
        body: '<a href="/trending/books">trending books</a>'
      }
      const expected = '<p dir=\"auto\"><a class=\"markdown-tag-link\" data-filter=\"trending\" data-tag=\"books\">trending books</a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('54 - Should highlight code', () => {
      const input = {
        author: 'foo354',
        permlink: 'bar354',
        last_update: '2021-08-18T09:15:49',
        body: `\`\`\`
          def factorial(n):
            # a comment
            return 1 if (n==1 or n==0) else n * factorial(n - 1)
          \`\`\`
        `
      }
      expect(markdown2Html(input)).toBe(SNAPSHOT_JSON.markdown_2_html_traversing_54_should_highlight_code)
    })

    it('55 - Should detect loom share', () => {
      const input = {
        author: 'foo355',
        permlink: 'bar355',
        last_update: '2021-08-18T09:15:49',
        body: 'https://www.loom.com/share/5bbdeb480ba84e65b1b3de8c190e2003'
      }
      const expected = '<p dir=\"auto\"><a class=\"markdown-video-link markdown-video-link-loom\"><iframe frameborder=\"0\" allowfullscreen=\"true\" src=\"https://www.loom.com/embed/5bbdeb480ba84e65b1b3de8c190e2003\" sandbox=\"allow-scripts allow-same-origin allow-popups\"></iframe></a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('56 - Should detect loom embed', () => {
      const input = {
        author: 'foo356',
        permlink: 'bar356',
        last_update: '2021-08-18T09:15:49',
        body: '<iframe width="640" height="327" src="https://www.loom.com/embed/5bbdeb480ba84e65b1b3de8c190e2003" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>'
      }
      const expected = '<iframe src=\"https://www.loom.com/embed/5bbdeb480ba84e65b1b3de8c190e2003\" frameborder=\"0\" webkitallowfullscreen=\"webkitallowfullscreen\" mozallowfullscreen=\"mozallowfullscreen\" allowfullscreen=\"allowfullscreen\"></iframe>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('57 - Should post linkify failed links', () => {
      const input = {
        author: 'foo357',
        permlink: 'bar357',
        last_update: '2021-08-18T09:15:49',
        body: '<p dir=\"auto\"><strong>THINGS WE CAN DO TO PREPARE FOR INDEFINITE LOCKDOWNS<br></strong>https://peakd.com/hive-123046/@ecotrain/ecotrain-question-of-the-week-5-2tie-up-post-things-we-can-do-to-prepare-for-indefinite-lockdowns </p>'
      }
      const expected = '<p dir=\"auto\"><strong>THINGS WE CAN DO TO PREPARE FOR INDEFINITE LOCKDOWNS<br /></strong><a data-tag=\"hive-123046\" data-author=\"ecotrain\" data-permlink=\"ecotrain-question-of-the-week-5-2tie-up-post-things-we-can-do-to-prepare-for-indefinite-lockdowns\" class=\"markdown-post-link\">/@ecotrain/ecotrain-question-of-the-week-5-2tie-up-post-things-we-can-do-to-prepare-for-indefinite-lockdowns</a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('58 - Should post linkify failed, spaced links', () => {
      const input = {
        author: 'foo358',
        permlink: 'bar358',
        last_update: '2021-08-18T09:15:49',
        body: `<p dir=\"auto\"><strong>It's a Secret, But is it good to have secrets?</strong><br>
        https://peakd.com/hive-123046/@ecotrain/ecotrain-question-of-the-week-season-5-1tie-up-post-it-s-a-secret-but-is-it-good-to-have-secrets </p> `
      }
      const expected = '<p dir=\"auto\"><strong>It\'s a Secret, But is it good to have secrets?</strong><br /><a data-tag=\"hive-123046\" data-author=\"ecotrain\" data-permlink=\"ecotrain-question-of-the-week-season-5-1tie-up-post-it-s-a-secret-but-is-it-good-to-have-secrets\" class=\"markdown-post-link\">/@ecotrain/ecotrain-question-of-the-week-season-5-1tie-up-post-it-s-a-secret-but-is-it-good-to-have-secrets</a></p>'
      expect(markdown2Html(input)).toBe(expected)
    })

    it('59 - Should handle Aureal iframe', () => {
      const input = {
        author: 'foo359',
        permlink: 'bar359',
        last_update: '2021-10-23T09:15:21',
        body: 'this is link <iframe loading="lazy" src="https://aureal-embed.web.app/535939" width="100%" height="200" frameborder="0" data-rocket-lazyload="fitvidscompatible" class="lazyloaded" data-ll-status="loaded"></iframe>'
      }
      const expected = '<p dir=\"auto\">this is link <iframe src=\"https://aureal-embed.web.app/535939\" frameborder=\"0\" class=\"lazyloaded\"></iframe></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('60 - Should not treat bare @scope/name as internal post link', () => {
      const input = {
        author: 'foo360',
        permlink: 'bar360',
        last_update: '2021-10-23T09:15:21',
        body: 'this is link @demo/test for internal'
      }
      // Bare @scope/name should NOT be linkified as a post link (could be npm package, etc.)
      const result = markdown2Html(input)
      expect(result).not.toContain('markdown-post-link')
    })

    it('61 - Should username with permlink with slash', () => {
      const input = {
        author: 'foo361',
        permlink: 'bar361',
        last_update: '2021-10-23T09:15:21',
        body: 'this is link /@demo/test for internal'
      }
      const expected = '<p dir=\"auto\"><span>this is link <a class=\"markdown-post-link\" data-author=\"demo\" data-tag=\"post\" data-permlink=\"test\">@demo/test</a> for internal</span></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('62 - Should not treat bare @scope/name at line start as internal post link', () => {
      const input = {
        author: 'foo362',
        permlink: 'bar362',
        last_update: '2021-10-23T09:15:21',
        body: '@demo/test for internal'
      }
      // Bare @scope/name should NOT be linkified as a post link
      const result = markdown2Html(input)
      expect(result).not.toContain('markdown-post-link')
    })

    it('63 - Should username with permlink with slash new line', () => {
      const input = {
        author: 'foo363',
        permlink: 'bar363',
        last_update: '2021-10-23T09:15:21',
        body: '/@demo/test for internal'
      }
      const expected = '<p dir=\"auto\"><span> <a class=\"markdown-post-link\" data-author=\"demo\" data-tag=\"post\" data-permlink=\"test\">@demo/test</a> for internal</span></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('64 - Should username with section link (requires leading /)', () => {
      const input = {
        author: 'foo364',
        permlink: 'bar364',
        last_update: '2021-10-23T09:15:21',
        body: '/@demo/wallet for internal'
      }
      const expected = '<p dir=\"auto\"><span> <a class=\"markdown-profile-link\" href=\"/@demo/wallet\">@demo/wallet</a> for internal</span></p>'

      expect(markdown2Html(input, false)).toBe(expected)
    })

    it('65 - Should handle youtube.com/embed videos', () => {
      const input = {
        author: 'foo365',
        permlink: 'bar365',
        last_update: '2019-05-10T09:15:21',
        body: 'https://www.youtube.com/embed/UuyS7YAkECA?start=295&autoplay=1'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-youtube" data-embed-src="https://www.youtube.com/embed/UuyS7YAkECA?autoplay=1" data-youtube="UuyS7YAkECA" data-start-time="295"><img class="no-replace video-thumbnail" itemprop="image" src="https://i.ecency.com/p/S5Eokt4BcQdk7EHeT1aYjzebg2hC7hkthT45eAMp88bZ44hfAQDm6BtJw2H53aq1Tpn1cu4?format=match&amp;mode=fit" loading="eager" fetchpriority="high" /><span class="markdown-video-play"></span></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('66 - Should handle internal links with params', () => {
      const input = {
        author: 'foo366',
        permlink: 'bar366',
        last_update: '2019-05-10T09:15:21',
        body: 'direct link https://ecency.com/@ecency/faq?history'
      }
      const expected = '<p dir=\"auto\">direct link <br /><a class=\"markdown-post-link\" data-href=\"https://ecency.com/@ecency/faq?history\" data-is-inline=\"true\" data-tag=\"post\" data-author=\"ecency\" data-permlink=\"faq\">@ecency/faq</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('67 - Should handle section links with params', () => {
      const input = {
        author: 'foo367',
        permlink: 'bar367',
        last_update: '2019-05-10T09:15:21',
        body: 'direct link https://ecency.com/@ecency/posts?q=games'
      }
      const expected = '<p dir=\"auto\">direct link <a href=\"https://ecency.com/@ecency/posts?q=games\" class=\"markdown-profile-link\">@ecency/posts?q=games</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('68 - Should handle section links', () => {
      const input = {
        author: 'foo368',
        permlink: 'bar368',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link [What is HIVE](#WhatHive) and locatino ## 1 <a data-id="WhatHive"></a>What is HIVE?'
      }
      const expected = '<p dir=\"auto\">this is link <a href=\"#WhatHive\" class=\"markdown-internal-link\">What is HIVE</a> and locatino ## 1 <a data-id=\"WhatHive\"></a>What is HIVE?</p>'

      expect(markdown2Html(input, false)).toBe(expected)
    })

    it('69 - Should handle section links', () => {
      const input = {
        author: 'foo369',
        permlink: 'bar369',
        last_update: '2019-05-10T09:15:21',
        body: 'this is link https://inleo.io/@godfish/close-range-reflections'
      }
      const expected = '<p dir=\"auto\">this is link <a href="/@godfish/close-range-reflections" class="markdown-post-link" data-is-inline="true">@godfish/close-range-reflections</a></p>'

      expect(markdown2Html(input, false)).toBe(expected)
    })

    it('70- Should handle youtube shorts/videos', () => {
      const input = {
        author: 'foo370',
        permlink: 'bar370',
        last_update: '2019-05-10T09:15:21',
        body: 'https://www.youtube.com/shorts/IaehbZnsi4w'
      }
      const expected = '<p dir=\"auto\"><a class="markdown-video-link markdown-video-link-youtube" data-embed-src="https://www.youtube.com/embed/IaehbZnsi4w?autoplay=1" data-youtube="IaehbZnsi4w"><img class="no-replace video-thumbnail" itemprop="image" src="https://i.ecency.com/p/S5Eokt4BcQdk7EHeT1aYjzebg2hC7hkthT45e5VviwaTq13pYBZesC7Hh3idYK26Q1RMUHU?format=match&amp;mode=fit" loading="eager" fetchpriority="high" /><span class="markdown-video-play"></span></a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })
  })

  describe("Rumble support", () => {

    it('Rumble iframes', () => {
      let expected = '<iframe frameborder="0" src="https://rumble.com/embed/vhwsp4/?pub=4"></iframe>'
      let input = {
        author: 'foo350x',
        permlink: 'bar350x',
        last_update: '2021-05-10T09:15:50',
        body: '<iframe width="640" height="360" scrolling="no" frameborder="0" style="border: none;" src="https://rumble.com/embed/vhwsp4/?pub=4"></iframe>'
      }
      expect(markdown2Html(input)).toBe(expected)
    })


    it('Rumble embed URL', () => {
      const expected = "<p dir=\"auto\"><a class=\"markdown-video-link markdown-video-link-rumble\" data-embed-src=\"https://www.rumble.com/embed/vhwsp4/?pub=4\"><span class=\"markdown-video-play\"></span></a></p>"
      let input = {
        author: 'foo350y',
        permlink: 'bar350y',
        last_update: '2021-05-10T09:16:50',
        body: '<a href="https://rumble.com/embed/vhwsp4/?pub=4">https://rumble.com/embed/vhwsp4/?pub=4</a>'
      }
      expect(markdown2Html(input)).toBe(expected)
    })

    it('Rumble iframes 2', () => {
      let expected = '<iframe class="rumble" src="https://rumble.com/embed/v2mb4d6/?pub=1aoesn" frameborder="0" allowfullscreen="allowfullscreen"></iframe>'
      let input = {
        author: 'foo350xx',
        permlink: 'bar350xx',
        last_update: '2021-05-10T09:15:50',
        body: '<iframe class="rumble" width="640" height="360" src="https://rumble.com/embed/v2mb4d6/?pub=1aoesn" frameborder="0" allowfullscreen></iframe>'
      }
      expect(markdown2Html(input)).toBe(expected)
    })

    // The following cannot be done: Convert URLs to the video page like this one
    // (https://rumble.com/vkhkzl-helping-my-girls-to-cool-down-in-the-heat.html)
    // to its corresponding embedded URL (https://rumble.com/embed/vhveub/?pub=4).
    // The relationship seems to be governed by a table.

  })

  describe("Brighteon support", () => {

    it('Brighteon iframes', () => {
      let expected = '<iframe src="https://www.brighteon.com/embed/5821540656001" frameborder=\"0\" allowfullscreen=\"allowfullscreen\"></iframe>'
      let input = {
        author: 'foo351x',
        permlink: 'bar351x',
        last_update: '2021-05-10T09:15:50',
        body: "<iframe src='https://www.brighteon.com/embed/5821540656001' width='560' height='315' frameborder='0' allowfullscreen></iframe>"
      }
      expect(markdown2Html(input)).toBe(expected)
    })

    it('Brightreon embed URL', () => {
      const expected = "<p dir=\"auto\"><a class=\"markdown-video-link markdown-video-link-brighteon\" data-embed-src=\"https://www.brighteon.com/embed/5821540656001\"><span class=\"markdown-video-play\"></span></a></p>"
      let input = {
        author: 'foo351y',
        permlink: 'bar351y',
        last_update: '2021-05-10T09:16:50',
        body: '<a href="https://www.brighteon.com/embed/5821540656001">https://www.brighteon.com/embed/5821540656001</a>'
      }
      expect(markdown2Html(input)).toBe(expected)
    })

    it('Brightreon page URL', () => {
      const expected = "<p dir=\"auto\"><a class=\"markdown-video-link markdown-video-link-brighteon\" data-embed-src=\"https://www.brighteon.com/embed/5821540656001\"><span class=\"markdown-video-play\"></span></a></p>"
      let input = {
        author: 'foo351z',
        permlink: 'bar351z',
        last_update: '2021-05-10T09:16:50',
        body: '<a href="https://www.brighteon.com/5821540656001">https://www.brighteon.com/5821540656001</a>'
      }
      expect(markdown2Html(input)).toBe(expected)
    })
  })

  describe("Odysee support", () => {
    it('Odysee watch URL becomes a player', () => {
      const expected = "<p dir=\"auto\"><a class=\"markdown-video-link markdown-video-link-odysee\" data-embed-src=\"https://odysee.com/$/embed/@whatsherface:2/Battle-of-the-Sexes:e\"><span class=\"markdown-video-play\"></span></a></p>"
      let input = {
        author: 'foo352a',
        permlink: 'bar352a',
        last_update: '2021-05-10T09:17:50',
        body: 'https://odysee.com/@whatsherface:2/Battle-of-the-Sexes:e'
      }
      expect(markdown2Html(input)).toBe(expected)
    })

    // A title containing "YouTube" must not be mistaken for a YouTube link.
    it('Odysee watch URL whose title contains YouTube', () => {
      const expected = "<p dir=\"auto\"><a class=\"markdown-video-link markdown-video-link-odysee\" data-embed-src=\"https://odysee.com/$/embed/@whatsherface:2/YouTube-HATES-me!:0\"><span class=\"markdown-video-play\"></span></a></p>"
      let input = {
        author: 'foo352b',
        permlink: 'bar352b',
        last_update: '2021-05-10T09:18:50',
        body: 'https://odysee.com/@whatsherface:2/YouTube-HATES-me!:0'
      }
      expect(markdown2Html(input)).toBe(expected)
    })

    // Hand-written Odysee iframes are still accepted; the tightened
    // odysee.com path pattern must not strip them.
    it('Odysee embed iframe survives sanitization', () => {
      const expected = "<iframe src=\"https://odysee.com/%24/embed/%40whatsherface%3A2%2FBattle-of-the-Sexes%3Ae\" allowfullscreen=\"allowfullscreen\" frameborder=\"0\"></iframe>"
      let input = {
        author: 'foo352c',
        permlink: 'bar352c',
        last_update: '2021-05-10T09:19:50',
        body: '<iframe src="https://odysee.com/%24/embed/%40whatsherface%3A2%2FBattle-of-the-Sexes%3Ae" allowfullscreen></iframe>'
      }
      expect(markdown2Html(input)).toBe(expected)
    })

    it('Odysee channel page stays an ordinary link', () => {
      let input = {
        author: 'foo352d',
        permlink: 'bar352d',
        last_update: '2021-05-10T09:20:50',
        body: 'https://odysee.com/@whatsherface:2'
      }
      expect(markdown2Html(input)).not.toContain('markdown-video-link')
    })
  })

  describe("Brand new tube support", () => {

    it('Brand new tube iframes', () => {
      let expected = '<iframe src=\"https://brandnewtube.com/embed/BSqeH7nhg8I41rM\" frameborder=\"0\" allowfullscreen=\"allowfullscreen\"></iframe>'
      let input = {
        author: 'foo352x',
        permlink: 'bar352x',
        last_update: '2021-05-10T09:15:50',
        body: "<iframe src='https://brandnewtube.com/embed/BSqeH7nhg8I41rM' frameborder='0' width='700' height='400' allowfullscreen></iframe>"
      }
      expect(markdown2Html(input)).toBe(expected)
    })

  })

  describe('Sanitization', () => {
    it('1- Should remove javascript links', () => {
      const input = {
        author: 'foo64',
        permlink: 'bar64',
        last_update: '2019-05-10T09:15:21',
        body: '<a href=\'javascript:void(0)\'>click here</a>'
      }
      const expected = '<p dir=\"auto\"><a>click here</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('2- Should convert script tag to span', () => {
      const input = {
        author: 'foo65',
        permlink: 'bar65',
        last_update: '2019-05-10T09:15:21',
        body: `<script>document.getElementById('body').remove();</script>`
      }
      const expected = 'document.getElementById(\'body\').remove();'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('3- Should remove not allowed attributes', () => {
      const input = {
        author: 'foo66',
        permlink: 'bar66',
        last_update: '2019-05-10T09:15:21',
        body: `<a title="Foo" onclick="document.bar()">Click</a>`
      }
      const expected = '<p dir=\"auto\"><a title="Foo">Click</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })

    it('4- Should remove javascript links', () => {
      const input = {
        author: 'foo67',
        permlink: 'bar67',
        last_update: '2019-05-10T09:15:21',
        body: `<a title="Foo" href="javascript:void(0)">Click</a>`
      }
      const expected = '<p dir=\"auto\"><a title="Foo">Click</a></p>'

      expect(markdown2Html(input)).toBe(expected)
    })
  })

  describe('Test files', () => {
    it('1- Should catch images in table', () => {
      const data = getTestData(
        'steemitboard',
        'steemitboard-notify-dunsky-20181210t153450000z'
      )

      data['author'] = 'foo68'
      data['permlink'] = 'foo68'
      data['last_update'] = '2019-05-10T09:15:21'
      expect(markdown2Html(data)).toBe(SNAPSHOT_JSON.markdown_2_html_test_files_1_should_catch_images_in_table)
    })
  })

  describe('Test legacy files', () => {
    const dataDir = `${__dirname}/test/data/legacy`

    const files = fs.readdirSync(dataDir)

    let x = 150

    for (const file of files) {
      if (file === '.DS_Store') {
        continue
      }
      const fileContents = fs.readFileSync(path.join(dataDir, file), 'utf8')
      const data = JSON.parse(fileContents)

      const id = data['id']
      const input = {
        author: 'foo' + x,
        permlink: 'bar' + x,
        last_update: '2019-05-10T09:15:21',
        body: data['input']
      }
      const expected = data['result']

      it('ID: ' + id, function () {
        expect(markdown2Html(input)).toBe(expected)
      })

      x += 1
    }
  })

  describe('forApp = false', () => {
    it('1', () => {
      const input = {
        author: 'foo1123',
        permlink: 'bar1123',
        last_update: '2019-05-10T09:15:21',
        body: 'https://img.esteem.ws/bbq3ob1idy.png <a href="https://steemit.com/esteem/@esteemapp/esteem-monthly-guest-curation-program-4">fooo</a> <a href="/esteem/@esteemapp/esteem-monthly-guest-curation-program-4">bar</a> <a href="http://external.com/loromoro">baz</a> #lorem @ipsum <a href=\'https://steemit.com/~witnesses\'>vote me</a>'
      }
      const expected = '<p dir="auto"><picture><source type="image/avif" srcset="https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=avif&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=avif&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=avif&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=avif&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=avif&amp;mode=fit&amp;width=1280 1280w" sizes="(max-width: 768px) 100vw, 700px" /><source type="image/webp" srcset="https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=webp&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=webp&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=webp&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=webp&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=webp&amp;mode=fit&amp;width=1280 1280w" sizes="(max-width: 768px) 100vw, 700px" /><img class="markdown-img-link" src="https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit" srcset="https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=320 320w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=600 600w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=800 800w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=1024 1024w, https://i.ecency.com/p/o1AJ9qDyyJNSpZWhUgGYc3MngFqoAMwgbeMkkd8SVxyfRVjiN?format=match&amp;mode=fit&amp;width=1280 1280w" sizes="(max-width: 768px) 100vw, 700px" loading="eager" decoding="async" itemprop="image" fetchpriority="high" /></picture> <a href="https://steemit.com/esteem/@esteemapp/esteem-monthly-guest-curation-program-4" class="markdown-external-link" target="_blank" rel="nofollow ugc noopener">fooo</a> <a href="/@esteemapp/esteem-monthly-guest-curation-program-4" class="markdown-post-link" data-is-inline="false">bar</a> <a href="http://external.com/loromoro" class="markdown-external-link" target="_blank" rel="nofollow ugc noopener">baz</a><span> <a class="er-tag er-tag-link" href="/trending/lorem">#lorem</a> <a class="er-author er-author-link" href="/@ipsum"><img class="er-author-link-image" src="https://i.ecency.com/u/ipsum/avatar/small" alt="ipsum" itemprop="image" loading="lazy" decoding="async" />@ipsum</a> </span><a href="https://steemit.com/~witnesses" class="markdown-external-link" target="_blank" rel="nofollow ugc noopener">vote me</a></p>'

      expect(markdown2Html(input, false)).toBe(expected)
    })

    it('2- Should handle external similar post links', () => {
      const input = {
        author: 'foo32',
        permlink: 'bar32',
        last_update: '2019-05-10T09:15:21',
        body: '[Voice: the criteria for success or failure](https://app.voice.com/post/@lukestokes/voice-the-criteria-for-success-or-failure-1597453134-597)'
      }
      const expected = '<p dir=\"auto\"><a href="https://app.voice.com/post/@lukestokes/voice-the-criteria-for-success-or-failure-1597453134-597" class="markdown-external-link" target="_blank" rel="nofollow ugc noopener">Voice: the criteria for success or failure</a></p>'

      expect(markdown2Html(input, false)).toBe(expected)
    })

    it('3- Should handle external similar post links', () => {
      const input = {
        author: 'foo33',
        permlink: 'bar33',
        last_update: '2019-05-10T09:15:21',
        body: '[Voice: the criteria for success or failure](https://app.voice.com/@lukestokes/voice-the-criteria-for-success-or-failure-1597453134-597)'
      }
      const expected = '<p dir=\"auto\"><a href="https://app.voice.com/@lukestokes/voice-the-criteria-for-success-or-failure-1597453134-597" class="markdown-external-link" target="_blank" rel="nofollow ugc noopener">Voice: the criteria for success or failure</a></p>'

      expect(markdown2Html(input, false)).toBe(expected)
    })

    it('4 - Should handle filtered tag internal link', () => {
      const input = {
        author: 'foo34',
        permlink: 'bar34',
        last_update: '2021-05-10T09:15:49',
        body: '<a href="/trending/books">trending books</a>'
      }
      const expected = '<p dir=\"auto\"><a href=\"/trending/books\" class=\"markdown-tag-link\">trending books</a></p>'
      expect(markdown2Html(input, false)).toBe(expected)
    })
  })

  describe('cleanReply', () => {
    it(' Should clean reply body', () => {
      const input = {
        parent_author: 'bar333',
        author: 'foo6401',
        permlink: 'bar6401',
        last_update: '2019-05-10T09:15:21',
        body: 'hello lorem ipsum \n Posted using [Partiko Android](https://partiko.app/referral/aftabkhan10) \n Posted using [Dapplr](https://app.dapplr.in/L55YHRuX4jKJ2SSk8) \n  Posted Using [LeoFinance](https://leofinance.io/@taskmaster4450/is-defi-for-real) \n Posted with [STEMGeeks](https://stemgeeks.net) \n  <center><sub>[Posted Using Aeneas.Blog](https://www.aeneas.blog/@rollie1212/sryptobrewmaster-weekend-rewards-3)</sub></center> \n <center><sub>Posted via [weedcash.network](https://www.weedcash.network/@cryptounicorn420/thc-and-nft-rising-star-hive-blockchain-game)</sub></center>'
      }
      const expected = '<p dir=\"auto\">hello lorem ipsum</p>'

      expect(markdown2Html(input)).toBe(expected)
    })
  })

  describe('Inline code should not linkify mentions', () => {
    it('should not create author links inside backtick-wrapped text', () => {
      const input = '`@aws-sdk/client-s3`'
      const result = markdown2Html(input, false)
      expect(result).toContain('<code>@aws-sdk/client-s3</code>')
      expect(result).not.toContain('markdown-author-link')
      expect(result).not.toContain('markdown-post-link')
    })

    it('should not create author links inside inline code in a sentence', () => {
      const input = '~3MB (`@aws-sdk/client-s3` only)'
      const result = markdown2Html(input, false)
      expect(result).toContain('<code>@aws-sdk/client-s3</code>')
      expect(result).not.toContain('markdown-author-link')
      expect(result).not.toContain('markdown-post-link')
    })

    it('should not create author links inside backtick-wrapped username', () => {
      const input = '`@hiveio/dhive`'
      const result = markdown2Html(input, false)
      expect(result).toContain('<code>@hiveio/dhive</code>')
      expect(result).not.toContain('markdown-author-link')
      expect(result).not.toContain('markdown-post-link')
    })

    it('should not create author links for simple mention inside backticks', () => {
      const input = 'use `@scope` package'
      const result = markdown2Html(input, false)
      expect(result).toContain('<code>@scope</code>')
      expect(result).not.toContain('markdown-author-link')
    })

    it('should not linkify mentions inside fenced code blocks', () => {
      const input = '```\n@aws-sdk/client-s3\n```'
      const result = markdown2Html(input, false)
      // Code block wrapper must be present (content may be syntax-highlighted into spans)
      expect(result).toContain('<pre><code>')
      expect(result).toContain('</code></pre>')
      expect(result).toMatch(/aws/)
      expect(result).toMatch(/sdk/)
      expect(result).not.toContain('markdown-author-link')
      expect(result).not.toContain('markdown-post-link')
    })

    it('should not linkify hashtags inside inline code', () => {
      const input = 'use `#hashtag` in code'
      const result = markdown2Html(input, false)
      expect(result).toContain('<code>#hashtag</code>')
      expect(result).not.toContain('markdown-tag-link')
    })

    it('should still linkify mentions outside of code', () => {
      const input = '@goodkarma is great'
      const result = markdown2Html(input, false)
      expect(result).toContain('er-author-link')
    })
  })

  describe('Format handling (webp via server Accept header)', () => {
    it('Emits a <picture> (avif/webp/match) for forApp=false regardless of the dead webp flag', () => {
      const input = 'lorem ipsum https://i.ecency.com/foobarbaz.jpg dolor sit amet'

      expect(markdown2Html(input, false, true)).toBe(SNAPSHOT_JSON.markdown_2_html_webp_support_should_render_images_in_match_format)
      expect(markdown2Html(input, false, false)).toBe(SNAPSHOT_JSON.markdown_2_html_webp_support_should_render_images_in_match_format)
    })
  })

  describe('inertAuthorAndTagChips', () => {
    const inert = { inertAuthorAndTagChips: true }
    const body = 'Danke dennoch an @der-prophet und #powerup day'

    it('renders both chips as spans with no href, through the full pipeline', () => {
      const out = markdown2Html(body, false, false, 'ecency.com', undefined, inert)

      expect(out).toContain('<span class="er-author er-author-link">')
      expect(out).toContain('<span class="er-tag er-tag-link">')
      expect(out).not.toContain('href="/@der-prophet"')
      expect(out).not.toContain('href="/trending/powerup"')
    })

    it('keeps the avatar image, which the sanitizer must not strip from a span', () => {
      const out = markdown2Html(body, false, false, 'ecency.com', undefined, inert)

      expect(out).toContain('class="er-author-link-image"')
      expect(out).toContain('/u/der-prophet/avatar/small')
    })

    // A chip is normally an <a>, and the 'a' ancestor guard in text.method is what
    // stops traverse() from re-linkifying the chip's own label. An inert chip is a
    // <span>, so without the class-based guard the label expands into a nested chip
    // on every pass until the render throws and falls back to unenhanced HTML.
    it('does not re-linkify its own label into nested chips', () => {
      const out = markdown2Html(body, false, false, 'ecency.com', undefined, inert)

      expect(out.match(/er-author-link"/g)).toHaveLength(1)
      expect(out.match(/er-tag-link"/g)).toHaveLength(1)
      expect(out).not.toContain('<span class="er-author er-author-link"><span')
    })

    it('still enhances the surrounding paragraph rather than falling back', () => {
      const out = markdown2Html(body, false, false, 'ecency.com', undefined, inert)

      expect(out).toContain('dir="auto"')
    })

    it('leaves chips as links when the option is absent', () => {
      const out = markdown2Html(body, false, false, 'ecency.com')

      expect(out).toContain('href="/@der-prophet"')
      expect(out).toContain('href="/trending/powerup"')
    })

    // `class` is author-writable: the sanitizer permits it on <span> and runs after
    // traverse, so a post body can carry `er-tag-link` into the DOM the guard walks.
    // An unconditional guard would let any author suppress linkification for every
    // reader on ecency.com and in the mobile app.
    describe('author-supplied chip classes on the default path', () => {
      const hostile = '<span class="er-tag-link">hello @alice and #btc</span>'

      it('still linkifies inside an author span for forApp=true', () => {
        const out = markdown2Html(hostile, true)

        expect(out).toContain('data-author="alice"')
        expect(out).toContain('data-tag="btc"')
      })

      it('still linkifies inside an author span for forApp=false', () => {
        const out = markdown2Html(hostile, false, false, 'ecency.com')

        expect(out).toContain('href="/@alice"')
        expect(out).toContain('href="/trending/btc"')
      })

      it('does not match class names that merely contain a chip token', () => {
        const out = markdown2Html(
          '<span class="custom-er-tag-link-label">hello @alice</span>',
          false,
          false,
          'ecency.com',
          undefined,
          inert
        )

        expect(out).toContain('<span class="er-author er-author-link">')
      })

      it('suppresses re-linkification only inside a real chip on inert renders', () => {
        const out = markdown2Html(hostile, false, false, 'ecency.com', undefined, inert)

        // The author's own span is a genuine chip-class token, so its contents are
        // left alone on this path. Accepted: narrow, and only on self-hosted.
        expect(out).toContain('hello @alice and #btc')
      })
    })

    it('does not serve a cached render across differing options for the same entry', () => {
      const entry = {
        author: 'chipcache',
        permlink: 'chipcache',
        last_update: '2019-05-10T09:15:21',
        body
      }

      const linked = markdown2Html(entry, false, false, 'ecency.com')
      const inertOut = markdown2Html(entry, false, false, 'ecency.com', undefined, inert)

      expect(linked).toContain('href="/@der-prophet"')
      expect(inertOut).not.toContain('href="/@der-prophet"')
      expect(inertOut).toContain('<span class="er-author er-author-link">')
    })
  })
})
