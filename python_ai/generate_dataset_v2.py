"""
EchoTrace — Phase 2 Dataset Generator
======================================
Generates synthetic_reviews_v2.csv with:
  - Realistic hard cases (subtle fakes, enthusiastic genuines)
  - Balanced linguistic patterns across classes
  - Product category diversity
  - Template group IDs for group-aware splitting
  - Extended schema: data_source, generation_method, template_group_id

Labels are assigned based on KNOWN GENERATION SCENARIO, not surface patterns.
These reviews are synthetic and for research/training purposes only.
Do not post these online. Do not claim they represent real customer reviews.
"""

import csv
import os
import random

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'synthetic_reviews_v2.csv')

FIELDNAMES = [
    'review_text', 'language', 'label',
    'deception_type', 'product_category',
    'data_source', 'generation_method', 'template_group_id'
]

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 DATASET
# Hard cases: enthusiastic genuine ≈ subtle fake surface patterns
# and vice versa. Labels based on generation scenario only.
# ─────────────────────────────────────────────────────────────────────────────

REVIEWS = [

    # ══════════════════════════════════════════════════════════════════════════
    # GENUINE REVIEWS — Label 0
    # ══════════════════════════════════════════════════════════════════════════

    # --- English Genuine: Electronics ---
    ("Honestly one of the best headphones I've owned at this price range. The bass hits hard and the ear cushions are surprisingly comfortable. Been using it daily for 3 months with zero issues.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_elec_01'),
    ("Sound quality surprised me tbh. Not audiophile level but way better than I expected for this price. No mic issues on calls. Will repurchase.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_elec_01'),
    ("Battery died after 8 months but the earphones themselves still work perfectly. Replacement batteries are cheap. Good product overall.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_elec_02'),
    ("Screen is vivid and responsive. The case feels premium. Only issue is the camera bump scratches easily on hard surfaces. Minor complaint.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_elec_02'),
    ("Keyboard is tactile and satisfying. Some keys feel slightly mushy compared to the Cherry MX version but for daily typing it's excellent. Zero flex on the frame.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_elec_03'),
    ("Laptop runs cool under normal load. Gaming heats the bottom a bit but thermals stay safe according to HWMonitor. Fan noise is moderate.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_elec_03'),
    ("USB-C hub works flawlessly on my MacBook. All 7 ports active simultaneously with no drops. Gets slightly warm but nothing alarming.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_elec_04'),
    ("Mouse is surprisingly precise for an entry-level optical. Side buttons are clicky and responsive. Grip is fine for medium hands.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_elec_04'),

    # --- English Genuine: Hard Case — Enthusiastic but authentic ---
    ("OH MY GOD this charger is insane. Charged my phone from 5% to 100% in literally 35 minutes. No overheating at all. Best charger I've ever bought. Absolutely love it.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_hard_01'),
    ("I am obsessed with this blender. Makes THE smoothest smoothies I've ever had. Zero chunks. The motor sounds powerful and confident. Nothing bad to say. 10/10.", 0, 'English', '', 'appliances', 'synthetic_phase2', 'handcrafted', 'g_en_hard_01'),
    ("Just received this and I screamed. The color is exactly right, material is premium, fit is perfect. I've been wanting this for months and it delivered 100%.", 0, 'English', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_en_hard_02'),
    ("Five stars is not enough. This skincare serum cleared my acne scars in 3 weeks. I've tried maybe 10 other products and nothing worked like this. Genuinely life-changing.", 0, 'English', '', 'beauty', 'synthetic_phase2', 'handcrafted', 'g_en_hard_02'),

    # --- English Genuine: Short and simple ---
    ("Works well. Fast shipping.", 0, 'English', '', 'accessories', 'synthetic_phase2', 'handcrafted', 'g_en_short_01'),
    ("Good quality. Would buy again.", 0, 'English', '', 'household', 'synthetic_phase2', 'handcrafted', 'g_en_short_01'),
    ("Exactly as described. Happy with purchase.", 0, 'English', '', 'accessories', 'synthetic_phase2', 'handcrafted', 'g_en_short_02'),
    ("Decent product for the price.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_short_02'),
    ("Arrived fast. Packaging was secure.", 0, 'English', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_en_short_03'),
    ("Works as expected.", 0, 'English', '', 'household', 'synthetic_phase2', 'handcrafted', 'g_en_short_03'),

    # --- English Genuine: Negative / Critical ---
    ("Disappointed. The zipper broke after 2 weeks of light use. Material looks nice but clearly not durable. Requested a refund.", 0, 'English', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_en_neg_01'),
    ("Does not match the product listing photos. Color is completely different. The size guide is wrong. Poor experience.", 0, 'English', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_en_neg_01'),
    ("Battery lasts maybe 2 hours with moderate use. Seller claimed 6 hours. Extremely misleading. The sound quality itself is fine but the battery is unacceptable.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_neg_02'),
    ("Returned it. The screen had visible dead pixels out of the box. Customer service was slow to respond.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_neg_02'),
    ("Not worth the price at all. You can get the same quality for half the cost from other sellers. The branding is the only thing you're paying for.", 0, 'English', '', 'beauty', 'synthetic_phase2', 'handcrafted', 'g_en_neg_03'),
    ("Smells weird when heated. Contacted seller and they said normal but it shouldn't smell like burning plastic.", 0, 'English', '', 'appliances', 'synthetic_phase2', 'handcrafted', 'g_en_neg_03'),

    # --- English Genuine: Mixed ---
    ("Good build quality but the instruction manual is useless. Spent an hour figuring out the setup through YouTube. Once running it works well.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_mixed_01'),
    ("Love the design but hate the packaging — arrived completely crushed. Product inside was fine but barely.", 0, 'English', '', 'accessories', 'synthetic_phase2', 'handcrafted', 'g_en_mixed_01'),
    ("Performance is great for the first few weeks. Slowdown starts appearing after a month. May be a software issue. 3.5 stars honestly.", 0, 'English', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_en_mixed_02'),
    ("Comfortable shoes but narrow for wide feet. Told my sister and she fit them perfectly. It's a fit issue not a quality issue.", 0, 'English', '', 'footwear', 'synthetic_phase2', 'handcrafted', 'g_en_mixed_02'),

    # --- Tagalog Genuine ---
    ("Maganda ang kalidad ng tela. Sulit ang presyo. Malambot at hindi nakakairita sa balat kahit mainit na panahon.", 0, 'Tagalog', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_tl_01'),
    ("Dumating ng maayos ang package. Nakabalot nang maigi sa bubble wrap. Gumana agad pagbukas ko. Salamat sa seller.", 0, 'Tagalog', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_tl_01'),
    ("Medyo mahal pero maayos naman ang quality. Hindi ako makapagreklamo sa gawa dahil matibay talaga.", 0, 'Tagalog', '', 'household', 'synthetic_phase2', 'handcrafted', 'g_tl_02'),
    ("Ang bilis ng delivery, dalawang araw lang. Tama naman ang size na pinili ko base sa size chart.", 0, 'Tagalog', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_tl_02'),
    ("Nag-order na ko ng dalawang beses dito. Pareho namang maayos ang item. Maaasahan ang seller.", 0, 'Tagalog', '', 'accessories', 'synthetic_phase2', 'handcrafted', 'g_tl_03'),
    ("Hindi ko pa nagagamit ng matagal pero mukha namang matibay. Ibibigay ko update kung may problema.", 0, 'Tagalog', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_tl_03'),
    ("Okay naman pero sana mas maayos ang packaging. Medyo may nabasag sa gilid pero ang main item okay pa rin.", 0, 'Tagalog', '', 'household', 'synthetic_phase2', 'handcrafted', 'g_tl_04'),
    ("Subok na ito sa akin. Ginamit ko na halos araw-araw at wala pa ring sira. Inirekomenda ko na sa kaibigan ko.", 0, 'Tagalog', '', 'appliances', 'synthetic_phase2', 'handcrafted', 'g_tl_04'),
    ("Hindi talaga ako marunong magsulat ng review pero maganda talaga. Tatlo na akong nabili dito.", 0, 'Tagalog', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_tl_05'),
    ("Maayos ang tahi at tela. Hindi kami nabigo. Nagustuhan pa ng nanay ko ito.", 0, 'Tagalog', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_tl_05'),

    # --- Tagalog Genuine: Hard Case — Enthusiastic ---
    ("Grabe itong product! Hindi ako makapaniwala na ganito kaganda. Pinakamahusay na binili ko sa Shopee ever. Sulit na sulit talaga!", 0, 'Tagalog', '', 'beauty', 'synthetic_phase2', 'handcrafted', 'g_tl_hard_01'),
    ("Sobrang ganda! Nung natanggap ko parang gusto ko pa nang mag-order ng isa pa. Maayos, matibay, at maganda ang kulay. Legit na purchase.", 0, 'Tagalog', '', 'accessories', 'synthetic_phase2', 'handcrafted', 'g_tl_hard_01'),

    # --- Tagalog Genuine: Negative ---
    ("Naaksaya ang pera ko dito. Pagdating hindi kapareho ng nasa picture. Nagpadala ako ng concern sa seller wala pang sagot.", 0, 'Tagalog', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_tl_neg_01'),
    ("Hindi ko inirekomenda. Bukas pa lang ng package sira na agad ang isang parte. Isa star lang ang nararapat.", 0, 'Tagalog', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_tl_neg_01'),

    # --- Taglish Genuine ---
    ("Okay naman ito. Fits well and malambot ang tela. Di napagod ang katawan ko kahit suot ko buong araw.", 0, 'Taglish', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_tx_01'),
    ("Sobrang bilis ng delivery! Arrived the next day pa. Ang ganda ng packaging at wala namang sira ang item.", 0, 'Taglish', '', 'accessories', 'synthetic_phase2', 'handcrafted', 'g_tx_01'),
    ("Works great, hindi ako na-disappoint. Sinubukan ko sa iba pero mas prefer ko ito. Better sound quality and mas comfy.", 0, 'Taglish', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_tx_02'),
    ("Medyo may flaw sa stitching pero hindi obvious. Overall, worth the price pa rin. I'd buy again if this breaks.", 0, 'Taglish', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_tx_02'),
    ("Luma na yung brand ko kaya I replaced it with this. Big upgrade. Mas mabilis, mas maayos, mas ganda ng finish.", 0, 'Taglish', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_tx_03'),
    ("Hindi ako marunong magreview pero legit na maganda ito. Inirerekomenda ko sa lahat ng nag-aatubili.", 0, 'Taglish', '', 'beauty', 'synthetic_phase2', 'handcrafted', 'g_tx_03'),
    ("Ganda ng product! Hindi ko inexpect na ganito kaganda in person. Mas maganda pa sa photos actually.", 0, 'Taglish', '', 'accessories', 'synthetic_phase2', 'handcrafted', 'g_tx_04'),
    ("Sulit na sulit. Mas matibay pa ito kaysa sa dati kong gamit na doble ang presyo. Satisfied customer here.", 0, 'Taglish', '', 'household', 'synthetic_phase2', 'handcrafted', 'g_tx_04'),
    ("Nagustuhan ng buong pamilya. Practical at maganda pa. Definitely will order again pagkatapos maubos ito.", 0, 'Taglish', '', 'household', 'synthetic_phase2', 'handcrafted', 'g_tx_05'),
    ("Tried it for 2 weeks na and no complaints pa rin. Great product, competitive price. Good seller.", 0, 'Taglish', '', 'beauty', 'synthetic_phase2', 'handcrafted', 'g_tx_05'),

    # --- Taglish Genuine: Hard Case — looks promotional but authentic ---
    ("Best buy ko talaga sa buong taon. Hindi ako nagsisisi kahit ni minuto. Kung mag-aatubili ka pa, huwag na. Bumili na.", 0, 'Taglish', '', 'electronics', 'synthetic_phase2', 'handcrafted', 'g_tx_hard_01'),
    ("Walang kapintasan. Sobrang ganda. Inirekomenda na ko sa tatlong tao at lahat sila nag-order na rin. Legit.",  0, 'Taglish', '', 'clothing', 'synthetic_phase2', 'handcrafted', 'g_tx_hard_01'),

    # ══════════════════════════════════════════════════════════════════════════
    # FAKE / DECEPTIVE REVIEWS — Label 1
    # ══════════════════════════════════════════════════════════════════════════

    # --- English Fake: Subtle paid review (hard case — sounds natural) ---
    ("I've been using this moisturizer for about three weeks now and honestly my skin has improved a lot. No breakouts, no irritation. Really happy with this purchase.", 1, 'English', 'undisclosed_incentive', 'beauty', 'synthetic_phase2', 'handcrafted', 'f_en_subtle_01'),
    ("This keyboard is fantastic for long typing sessions. The switches feel premium and the RGB is just the right amount of brightness. Highly recommend for office use.", 1, 'English', 'undisclosed_incentive', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_en_subtle_01'),
    ("Been wearing these shoes for about two months now. Very comfortable for daily commutes. No blisters, no rubbing. The sole is still intact. Good buy.", 1, 'English', 'coordinated_campaign', 'footwear', 'synthetic_phase2', 'handcrafted', 'f_en_subtle_02'),
    ("The blender handled frozen ingredients without any trouble. I make protein shakes every morning and it's been holding up well. Cleans easily too.", 1, 'English', 'coordinated_campaign', 'appliances', 'synthetic_phase2', 'handcrafted', 'f_en_subtle_02'),
    ("Arrived in three days. Packaging was excellent. Product looks exactly like the photo and functions perfectly. Very satisfied with this seller.", 1, 'English', 'template_farm', 'accessories', 'synthetic_phase2', 'handcrafted', 'f_en_subtle_03'),
    ("Great value for the price. The quality is better than expected. Would definitely order again. Fast shipping too.", 1, 'English', 'template_farm', 'household', 'synthetic_phase2', 'handcrafted', 'f_en_subtle_03'),

    # --- English Fake: Fabricated technical detail ---
    ("Tested the charger output with my USB meter and it consistently delivers 65W. No voltage spikes. Very stable for my laptop.", 1, 'English', 'fabricated_usage', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_en_tech_01'),
    ("Used the thermometer to measure my oven and it matched my calibrated reference within 1 degree Celsius. Impressive accuracy for this price point.", 1, 'English', 'fabricated_usage', 'household', 'synthetic_phase2', 'handcrafted', 'f_en_tech_01'),
    ("The noise cancellation tested at about -25dB reduction in my recording booth. Comparable to headphones that cost three times more.", 1, 'English', 'fabricated_usage', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_en_tech_02'),
    ("Ran a benchmark and the SSD clocked 3400MB/s sequential read. Matches the advertised spec exactly. No throttling after sustained writes.", 1, 'English', 'fabricated_usage', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_en_tech_02'),

    # --- English Fake: Review template disguised as natural writing ---
    ("I ordered this last month and it has exceeded all my expectations. The quality is amazing and the price is unbeatable. My whole family loves it now.", 1, 'English', 'template_farm', 'household', 'synthetic_phase2', 'handcrafted', 'f_en_tmpl_01'),
    ("Purchased this two weeks ago and I could not be happier. Works exactly as described. Shipping was fast and the packaging protected the product well.", 1, 'English', 'template_farm', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_en_tmpl_01'),
    ("This is exactly what I was looking for. Great quality and arrived quickly. Very happy with my purchase. Definitely recommend to anyone considering it.", 1, 'English', 'template_farm', 'accessories', 'synthetic_phase2', 'handcrafted', 'f_en_tmpl_02'),
    ("Exceeded my expectations in every way. Great product, great price, great seller. Will be back for more. Five stars without hesitation.", 1, 'English', 'template_farm', 'clothing', 'synthetic_phase2', 'handcrafted', 'f_en_tmpl_02'),

    # --- English Fake: Competitor sabotage ---
    ("Do not buy this brand. I switched to GenuinePro and the difference is night and day. This product stopped working after a week. Total waste of money.", 1, 'English', 'competitor_manipulation', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_en_comp_01'),
    ("I've tried five different brands and this is by far the worst. Fragile, unreliable, and overpriced. The brand I use now is so much better I can't believe I wasted money here.", 1, 'English', 'competitor_manipulation', 'household', 'synthetic_phase2', 'handcrafted', 'f_en_comp_01'),

    # --- English Fake: Incentivized (subtle) ---
    ("Seller reached out after my initial review and provided a replacement unit. Updating my review — the new unit works perfectly. Very responsive seller.", 1, 'English', 'undisclosed_incentive', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_en_incent_01'),
    ("Got a discount voucher with my package to try their other products. Left this review voluntarily. Product is as good as described.", 1, 'English', 'undisclosed_incentive', 'beauty', 'synthetic_phase2', 'handcrafted', 'f_en_incent_01'),
    ("I was selected for a product testing program. Received the item at no charge for evaluation purposes. Giving honest feedback — works as advertised.", 1, 'English', 'undisclosed_incentive', 'accessories', 'synthetic_phase2', 'handcrafted', 'f_en_incent_02'),
    ("Seller offered a partial refund if I left a positive review. I'm leaving a positive review because the product is actually good, not just for the refund.", 1, 'English', 'undisclosed_incentive', 'household', 'synthetic_phase2', 'handcrafted', 'f_en_incent_02'),

    # --- Tagalog Fake: Subtle ---
    ("Maganda talaga itong product. Ginamit ko na ng ilang linggo at okay pa rin. Walang reklamo. Sulit ang presyo.", 1, 'Tagalog', 'template_farm', 'clothing', 'synthetic_phase2', 'handcrafted', 'f_tl_subtle_01'),
    ("Dumating ng mabilis at maayos ang packaging. Gumana agad at walang defect. Masaya ako sa binili ko.", 1, 'Tagalog', 'template_farm', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_tl_subtle_01'),
    ("Maayos na seller at mabilis mag-respond sa message. Product as described. Ibabalik ako mag-order dito.", 1, 'Tagalog', 'coordinated_campaign', 'accessories', 'synthetic_phase2', 'handcrafted', 'f_tl_subtle_02'),
    ("Hindi ako nabigo sa pagbili ko dito. Matibay at maganda. Inirekomenda ko na sa mga kaibigan ko.", 1, 'Tagalog', 'coordinated_campaign', 'household', 'synthetic_phase2', 'handcrafted', 'f_tl_subtle_02'),

    # --- Tagalog Fake: Incentivized ---
    ("Nagbigay ng voucher ang seller kaya sinubukan ko. Maganda naman pala. Hindi ko pala dapat pinagsabihan pero totoo naman.", 1, 'Tagalog', 'undisclosed_incentive', 'beauty', 'synthetic_phase2', 'handcrafted', 'f_tl_incent_01'),
    ("Pinayagan akong mag-review kapalit ng discount sa susunod na order. Pero totoo naman na maganda ang product.", 1, 'Tagalog', 'undisclosed_incentive', 'clothing', 'synthetic_phase2', 'handcrafted', 'f_tl_incent_01'),
    ("May kasamang note sa package na humihiling ng 5 stars review kapalit ng libreng item sa susunod. Nagbibigay ako ng 5 stars.", 1, 'Tagalog', 'undisclosed_incentive', 'accessories', 'synthetic_phase2', 'handcrafted', 'f_tl_incent_02'),
    ("Seller nag-message at nag-offer ng cashback kung mag-5 stars. Nagbigay na ako dahil maganda naman ang product.", 1, 'Tagalog', 'undisclosed_incentive', 'household', 'synthetic_phase2', 'handcrafted', 'f_tl_incent_02'),

    # --- Tagalog Fake: Template farm ---
    ("Maganda ang product. Maayos ang dating. Okay ang seller. Ibabalik ako. 5 stars.", 1, 'Tagalog', 'template_farm', 'clothing', 'synthetic_phase2', 'handcrafted', 'f_tl_tmpl_01'),
    ("Sulit ang presyo. Maganda ang kalidad. Mabilis ang delivery. Satisfied. Recommend.", 1, 'Tagalog', 'template_farm', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_tl_tmpl_01'),
    ("Okay naman. Ganda. Mabilis. Legit seller. 5 stars walang alinlangan.", 1, 'Tagalog', 'template_farm', 'accessories', 'synthetic_phase2', 'handcrafted', 'f_tl_tmpl_02'),
    ("Maayos ang item. Tama ang dating. Pasok sa budget. Solid. Babalik.", 1, 'Tagalog', 'template_farm', 'household', 'synthetic_phase2', 'handcrafted', 'f_tl_tmpl_02'),

    # --- Taglish Fake: Subtle / Hard case ---
    ("Been using this for two weeks na and no issues. Feels sturdy and looks premium in person. Seller is responsive. Would definitely buy again.", 1, 'Taglish', 'template_farm', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_tx_subtle_01'),
    ("Super satisfied! Quality is better than expected at this price point. Packaging ay maayos at fast delivery. Highly recommend.", 1, 'Taglish', 'template_farm', 'accessories', 'synthetic_phase2', 'handcrafted', 'f_tx_subtle_01'),
    ("Works perfectly. Ganda pa ng design. Hindi ako nagsisisi sa binili ko. Will order ulit kapag naubos na.", 1, 'Taglish', 'coordinated_campaign', 'beauty', 'synthetic_phase2', 'handcrafted', 'f_tx_subtle_02'),
    ("Solid product at legit seller. Mabilis dumating and maayos ang condition ng item. No complaints at all.", 1, 'Taglish', 'coordinated_campaign', 'household', 'synthetic_phase2', 'handcrafted', 'f_tx_subtle_02'),

    # --- Taglish Fake: Incentivized ---
    ("Natanggap ko ang item kasama ng note na kung mag-5 star review ako may libre pang susunod na order. Honest review: maganda naman talaga.", 1, 'Taglish', 'undisclosed_incentive', 'clothing', 'synthetic_phase2', 'handcrafted', 'f_tx_incent_01'),
    ("Nag-offer ang seller ng GCash cashback kapag nag-review with photo. Nag-review na ko. Product is good naman.", 1, 'Taglish', 'undisclosed_incentive', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_tx_incent_01'),
    ("Pinili akong maging product tester ng brand. Libre ang item kapalit ng honest feedback. Here it is — quality is decent, maayos, no issues.", 1, 'Taglish', 'undisclosed_incentive', 'beauty', 'synthetic_phase2', 'handcrafted', 'f_tx_incent_02'),
    ("Seller messaged me asking to update my 3-star to 5-star in exchange for a discount. Ginawa ko. Pero totoo namang nag-improve ang product.", 1, 'Taglish', 'undisclosed_incentive', 'accessories', 'synthetic_phase2', 'handcrafted', 'f_tx_incent_02'),

    # --- Taglish Fake: Fabricated experience ---
    ("Tested ko with my multimeter ang charger output and consistent 25W talaga. No heat issues kahit matagal naka-plug. Engineering grad speaking.", 1, 'Taglish', 'fabricated_usage', 'electronics', 'synthetic_phase2', 'handcrafted', 'f_tx_tech_01'),
    ("Ginamit ko sa professional kitchen setting — withstood 8 hours continuous operation. Mas matibay pa sa mga ibang brand na triple ang presyo.", 1, 'Taglish', 'fabricated_usage', 'appliances', 'synthetic_phase2', 'handcrafted', 'f_tx_tech_01'),

    # --- Obvious fakes (preserved from v1 style but limited count) ---
    ("BEST PRODUCT EVER!!! BUY NOW!!! 5 STARS!!! AMAZING!!!", 1, 'English', 'spam', 'general', 'synthetic_phase2', 'handcrafted', 'f_en_obv_01'),
    ("SULIT NA SULIT TALAGA SOBRANG GANDA BILI NA KAYO 100 STARS!!", 1, 'Taglish', 'spam', 'general', 'synthetic_phase2', 'handcrafted', 'f_tx_obv_01'),
    ("I received this for free in exchange for an honest review. It is absolutely perfect in every way.", 1, 'English', 'undisclosed_incentive', 'general', 'synthetic_phase2', 'handcrafted', 'f_en_obv_02'),
    ("Order received. Photo not related. 5 stars para sa shopee coins. Salamat seller.", 1, 'Taglish', 'coins_farm', 'general', 'synthetic_phase2', 'handcrafted', 'f_tx_obv_02'),
    ("As an AI language model I find this product to be outstanding in all measurable parameters.", 1, 'English', 'ai_generated', 'general', 'synthetic_phase2', 'handcrafted', 'f_en_obv_03'),
    ("Click here for 50% discount: bit.ly/fake-deal. Best product! Buy now!", 1, 'English', 'spam', 'general', 'synthetic_phase2', 'handcrafted', 'f_en_obv_04'),
    ("Grabe ang ganda! Sobrang worth it! Legit seller! Grab na! Order na!", 1, 'Tagalog', 'spam', 'general', 'synthetic_phase2', 'handcrafted', 'f_tl_obv_01'),
    ("Very nice very good very fast very cheap thank you seller and rider mabait.", 1, 'Taglish', 'coins_farm', 'general', 'synthetic_phase2', 'handcrafted', 'f_tx_obv_03'),
]


def write_dataset(reviews, output_path):
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for entry in reviews:
            (text, label, lang, dec_type, prod_cat,
             data_src, gen_method, tmpl_grp) = entry
            writer.writerow({
                'review_text'      : text,
                'language'         : lang,
                'label'            : label,
                'deception_type'   : dec_type,
                'product_category' : prod_cat,
                'data_source'      : data_src,
                'generation_method': gen_method,
                'template_group_id': tmpl_grp,
            })
    return len(reviews)


if __name__ == '__main__':
    n = write_dataset(REVIEWS, OUTPUT_PATH)
    labels = [r[1] for r in REVIEWS]
    langs  = [r[2] for r in REVIEWS]
    print(f"Phase 2 dataset written: {n} reviews")
    print(f"  Genuine (0): {labels.count(0)}")
    print(f"  Fake    (1): {labels.count(1)}")
    from collections import Counter
    print(f"  Languages: {dict(Counter(langs))}")
    print(f"  Saved to: {OUTPUT_PATH}")
