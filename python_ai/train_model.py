"""
EchoTrace - Fake Review Classifier Training Script
===================================================
Run this script directly to retrain the ML model with a large,
curated dataset. It will overwrite fake_review_model.pkl and
tfidf_vectorizer.pkl with improved models.

Usage:
    python train_model.py
"""

import os
import sys
import pickle
import numpy as np # type: ignore
from sklearn.feature_extraction.text import TfidfVectorizer # type: ignore
from sklearn.linear_model import LogisticRegression # type: ignore
from sklearn.ensemble import GradientBoostingClassifier, VotingClassifier # type: ignore
from sklearn.svm import LinearSVC # type: ignore
from sklearn.calibration import CalibratedClassifierCV # type: ignore
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold # type: ignore
from sklearn.metrics import (classification_report, confusion_matrix, # type: ignore
                              accuracy_score, f1_score, roc_auc_score)

# ─────────────────────────────────────────────────────────────────────────────
# Model save paths (same as classifier.py so they are auto-loaded by Flask)
# ─────────────────────────────────────────────────────────────────────────────
BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH      = os.path.join(BASE_DIR, 'models', 'fake_review_model.pkl')
VECTORIZER_PATH = os.path.join(BASE_DIR, 'models', 'tfidf_vectorizer.pkl')

# ─────────────────────────────────────────────────────────────────────────────
# LARGE TRAINING DATASET
# Label 0 = Genuine review
# Label 1 = Fake / spam / AI-generated / paid / incentivised review
# ─────────────────────────────────────────────────────────────────────────────
TRAINING_DATA = [
    # ── GENUINE REVIEWS (Label 0) ─────────────────────────────────────────
    ("I bought this watch band for my Huawei Watch Fit 3. It fits perfectly and feels comfortable after wearing it all day. The silicone material is soft but durable.", 0),
    ("Not bad for the price. The color is slightly different from the picture but it's acceptable. Delivery took about 10 days.", 0),
    ("Decent quality for the cost. I've had it for two months and it's still holding up well. No peeling or cracking.", 0),
    ("The buckle feels a bit flimsy but otherwise a solid replacement strap. Would buy again.", 0),
    ("Arrived in good condition. Easy to install. My only complaint is the smell at first — it went away after a few days.", 0),
    ("Good product. The blue colour I ordered is slightly lighter than expected. Still looks nice.", 0),
    ("Works as described. I've been using it for jogging and it doesn't irritate my skin.", 0),
    ("Shipping was faster than expected. The band quality is decent for the price point.", 0),
    ("I ordered two bands in different colors. Both arrived on time and fit my watch correctly.", 0),
    ("Product is okay. The clasp could be better quality but for the money it's fine.", 0),
    ("Battery life on my watch improved when I stopped using the official band. This band is lightweight and comfortable.", 0),
    ("The strap broke after 3 weeks of normal use. Disappointed — expected better durability.", 0),
    ("Overall a good replacement. I had to re-adjust the fit twice before I got it right.", 0),
    ("My husband loves it. He said it's comfortable and doesn't cause any skin irritation during workouts.", 0),
    ("It's a basic strap, nothing fancy. Does the job.", 0),
    ("Second purchase. I bought black the first time and now pink. Both are good quality.", 0),
    ("Easy to put on. The quick-release mechanism makes swapping bands effortless.", 0),
    ("Good value for money. I was skeptical about the price but it turned out to be a quality product.", 0),
    ("Strap looks and feels like a premium band but at a fraction of the cost.", 0),
    ("Satisfied with the purchase. The band is soft and doesn't leave marks on the wrist after long use.", 0),
    ("The item arrived a day early which was a pleasant surprise. Quality matches the photos.", 0),
    ("I needed a quick replacement and this delivered. Not perfect but very functional.", 0),
    ("Band feels genuine. No rough edges, stitching is clean, and it clips securely.", 0),
    ("It's alright. Nothing special but nothing wrong either. Just a basic band.", 0),
    ("Fits my Huawei Watch Fit 5 perfectly. I've gone through two swimming sessions and it held up.", 0),
    ("Minor issue: one of the pins was slightly bent on arrival. Easy to fix, but still annoying.", 0),
    ("Comfortable during sleep tracking. Doesn't dig into the wrist.", 0),
    ("Looks good in person. The finish is matte which I prefer over glossy.", 0),
    ("Delivery packaging was secure and the band was protected well.", 0),
    ("I wear this 24/7 and after a month it's still looking good.", 0),
    ("Initially hesitant due to the low price, but pleasantly surprised by the quality.", 0),
    ("Color matches accurately with the listing. Good material, soft and flexible.", 0),
    ("The product is what it is — a budget strap. For the price, I'm satisfied.", 0),
    ("I've tried three different cheap bands and this one is the best so far.", 0),
    ("No issues with the clasp. Very secure. I almost forgot I was wearing a watch.", 0),
    ("Okay product. Would appreciate a better user manual for installation.", 0),
    ("My kid uses this for her watch and she's happy with it.", 0),
    ("Minor color mismatch but the quality and fit are excellent.", 0),
    ("Finally found a strap that doesn't cause my wrist to sweat excessively. This one is breathable.", 0),
    ("Used it for a hiking trip. Held up well in sweat and light rain.", 0),
    ("Pretty good for what you pay. Definitely better than the alternatives I've tried.", 0),
    ("The product arrived as described. Solid build, no complaints.", 0),
    ("I'm on my third month using this and it still looks like new.", 0),
    ("Feels premium for a budget band. Happy with my purchase.", 0),
    ("The smell fades after a couple of days of airing out.", 0),
    ("Comfortable and secure. No slipping during workouts.", 0),
    ("Good fit. I have a smaller wrist and it adjusts well enough.", 0),
    ("The blue is a bit darker than in the picture but still looks nice in person.", 0),
    ("Nothing fancy but it gets the job done. Would recommend to anyone needing a spare band.", 0),
    ("Holds up well during outdoor activities. Water-resistant as advertised.", 0),
    ("I'm happy with this purchase. Simple, functional, and affordable.", 0),
    ("Product quality is acceptable. I'd give it 3.5 stars if I could.", 0),
    ("It took a bit of effort to clip in but once seated it's very secure.", 0),
    ("Comfortable for daily use. Haven't noticed any skin reactions.", 0),
    ("Decent strap. Color is slightly off but the quality is fine.", 0),
    ("Fast shipping. The band fits snugly and feels comfortable after a day of use.", 0),
    ("Great product for the price. I use it for office and gym — works perfectly.", 0),
    ("Easy to install and looks good on the wrist. Quality is adequate.", 0),
    ("Better than expected for a budget replacement band.", 0),
    ("Lightweight and breathable — perfect for summer use.", 0),
    ("No issues so far after a month of daily use. Good value.", 0),
    ("The closure feels secure. I haven't had it pop open accidentally.", 0),
    ("Satisfied with the product. Not exceptional but reliable.", 0),
    ("Fits well and looks stylish on the watch. Happy with the purchase.", 0),
    ("Comfortable during sleep and exercise. Doesn't irritate the skin.", 0),
    ("The strap arrived in good condition and installation was straightforward.", 0),
    ("This is my second order. The first one wore out after 8 months of heavy use — that's fair.", 0),
    ("Good quality for an aftermarket band. I'd buy this over expensive branded options.", 0),
    ("Fits my watch like a glove. No gaps, no wobbling.", 0),
    ("Material feels premium — soft and slightly textured for grip.", 0),
    ("Arrived quickly. The band is as described. Solid purchase.", 0),
    ("I'm a nurse and I wear this all day. It holds up under frequent hand washing.", 0),
    ("Good product. The price point makes it an easy recommendation.", 0),
    ("No complaints. Simple product that does what it's supposed to.", 0),
    ("Third replacement band from this seller. Consistent quality every time.", 0),
    ("Nice texture, comfortable, easy to put on. What more do you need?", 0),
    ("Received quickly. Colour is accurate. Fits well. Would buy again.", 0),
    ("Good quality for a daily wear band. Slight plastic smell initially but fades.", 0),
    ("Used for sports. The band didn't slip or cause discomfort even after a long run.", 0),
    ("As expected. Nothing extraordinary but nothing disappointing either.", 0),
    ("The strap is flexible and adapts well to wrist movement.", 0),
    ("A bit tight at first but stretched slightly over time for a comfortable fit.", 0),
    ("Very happy with this purchase. It looks clean and professional.", 0),
    ("Better quality than the original band that came with my watch.", 0),
    ("I have sensitive skin and this hasn't caused any irritation — great sign.", 0),
    ("Good product. I've recommended it to two friends already.", 0),
    ("Arrived in perfect condition. The packaging was minimal but protective.", 0),
    ("Works exactly as described. Perfect replacement.", 0),
    ("My watch looks completely renewed with this band. Worth every penny.", 0),
    ("Durable and comfortable — the two things I care about most in a strap.", 0),
    ("It's a no-fuss replacement band. Gets the job done.", 0),
    ("Clean design, comfortable fit, affordable price. Highly functional.", 0),
    ("Excellent quality for the price. Very pleased.", 0),
    ("Used it for two weeks of hiking. Still looks and feels like new.", 0),
    ("Good product. Delivery was a bit slow but the item itself is worth it.", 0),
    ("I needed an affordable spare and this fits the bill perfectly.", 0),
    ("Quality control seems good — no visible defects or poor stitching.", 0),
    ("Happy with the purchase. Would recommend to anyone with a Huawei Watch.", 0),
    ("Comfortable for long periods of wear. My wrist doesn't ache with this band.", 0),
    ("Simple design, good function. Exactly what I needed.", 0),
    ("The clasp mechanism is easy to use even with one hand.", 0),
    ("Good replacement option for the official band at a lower price.", 0),
    ("Satisfied customer. Will order again when this one wears out.", 0),
    ("The fit is snug without being uncomfortably tight.", 0),
    ("Easy installation, comfortable wear, reasonable durability.", 0),
    ("I ordered three colors. All arrived promptly and all fit perfectly.", 0),
    ("The product looks exactly like the picture, which is rare for budget items.", 0),
    ("It's been through rain and sweat and still looks good. Durable enough.", 0),
    ("I like the variety of colors available. Glad I chose the green one.", 0),
    ("The band is light enough that I forget I'm wearing it. Comfortable.", 0),
    ("Seller packaging was neat and the band was wrapped carefully.", 0),
    ("I have wide wrists and this still fits fine with some adjustment.", 0),
    ("Solid product for casual use. Not for extreme sports but fine for daily wear.", 0),
    ("One of the holes was slightly misaligned but it still works.", 0),
    ("Not the best quality I've ever had but definitely not the worst.", 0),
    ("Good for the price tag. I've seen worse from more expensive brands.", 0),
    ("Does what it's supposed to. Comfortable, secure, affordable.", 0),
    ("I've washed it twice and the color hasn't faded. Good sign.", 0),
    ("The strap is flexible and breathable. Good for hot weather.", 0),
    ("Fits well but could use one more hole for a tighter adjustment.", 0),
    ("Happy with the delivery time and product quality. Would recommend.", 0),
    ("It has held up for 6 months of daily use without any issues.", 0),
    ("The product is durable and the color is consistent throughout.", 0),
    ("Good budget option. For casual users this is more than adequate.", 0),
    ("Simple and functional. Exactly what I needed without spending a lot.", 0),
    ("Comfortable after the first two days of breaking it in.", 0),
    ("The fit took some adjusting but now sits perfectly on my wrist.", 0),
    ("Held up well during a 10km run. No slipping or skin irritation.", 0),
    ("The product is well made for the price. Highly functional.", 0),
    ("I've used this daily for four months. Still looks good.", 0),
    ("Packaging was minimal but the product itself was well-protected.", 0),
    ("A solid replacement band. Comfortable and durable.", 0),
    ("Shipping was slower than expected but the product was worth the wait.", 0),
    ("The band works great as a daily driver. Not fancy but dependable.", 0),
    ("Clean stitching and solid clasp. Good build quality for the price.", 0),

    # ── FAKE / SPAM / PAID / AI-GENERATED REVIEWS (Label 1) ──────────────
    ("AMAZING!!! BEST PRODUCT EVER!!! BUY NOW!!! YOU WON'T REGRET IT!!! 5 STARS!!!", 1),
    ("This is the absolute best watch band on the planet. Perfect in every way. Buy it immediately.", 1),
    ("I received this product for free in exchange for an honest review. It is absolutely perfect.", 1),
    ("Got a discount code to review this. Honestly the best strap I've ever used. Nothing wrong at all.", 1),
    ("BEST SELLER! CHEAP PRICE! FREE SHIPPING! ORDER NOW! LIMITED STOCK!", 1),
    ("Highly recommended to everyone! Click here for more reviews on my blog: www.fake-reviews.com", 1),
    ("This product changed my life! I can't believe how amazing it is. Must buy for everyone!", 1),
    ("Super fast! Super cheap! Super quality! Five stars! Highly recommended! Buy now!", 1),
    ("I was paid to review this product. It's honestly perfect and I have no complaints.", 1),
    ("BEST PRODUCT I HAVE EVER PURCHASED IN MY ENTIRE LIFE!!! FIVE STARS!!!!", 1),
    ("Outstanding! Magnificent! Superb! Exceptional! Buy this immediately! Do not hesitate!", 1),
    ("The seller gave me a coupon code for my next order. Great product, will definitely recommend.", 1),
    ("This is a sponsored review. The product is excellent in every way. Zero issues.", 1),
    ("Wow! Absolutely incredible! My life is transformed! Best purchase of the decade!", 1),
    ("I got this for free to review. It is perfect in every single way. Highly recommend!", 1),
    ("Visit my channel for an unboxing review! Link in bio! Discount code: FAKE2024", 1),
    ("EXCELLENT VALUE!! SUPERB QUALITY!! AMAZING SELLER!! FAST DELIVERY!!! 5/5!!!", 1),
    ("The best product I have ever seen in my life. Exceeded all expectations. No flaws whatsoever.", 1),
    ("I received this item complimentary for providing an unbiased honest review.", 1),
    ("Subscribe to my YouTube channel for more reviews! promo code: WATCH10", 1),
    ("This product is perfect. As an AI language model, I cannot find any faults with it.", 1),
    ("As an AI, I find this product to be outstanding in all parameters measured.", 1),
    ("In conclusion, this is the best product available. It is worth noting that quality is exceptional.", 1),
    ("Overall, it is important to note that this product seamlessly integrates into your lifestyle.", 1),
    ("It is crucial to note that this tapestry of quality craftsmanship is unmatched.", 1),
    ("This product delves into the realm of quality that transcends ordinary standards.", 1),
    ("Wow amazing buy now!! Five stars no problems great quality cheap price fast shipping!!", 1),
    ("Great great great! Amazing amazing amazing! Best best best! Buy buy buy!", 1),
    ("SCAM!! DO NOT BUY!! FAKE SELLER!! ZERO STARS!! STAY AWAY!!", 1),
    ("Got this as a freebie for leaving a 5-star review. Product is great as expected.", 1),
    ("Received in exchange for honest review. Works beyond expectations. Highly recommend.", 1),
    ("Sponsored. All opinions are my own. This is perfect in every measurable way.", 1),
    ("Click the link in my bio for a 20% discount on your first order from this seller!", 1),
    ("I am a verified buyer. I received this product at a discounted price for this review.", 1),
    ("This product is absolutely flawless. Not a single issue. Perfect 10 out of 10.", 1),
    ("HURRY! LIMITED TIME OFFER! Buy now before stocks run out! Best deal ever!", 1),
    ("100% authentic genuine product! Best in market! No comparison! Buy immediately!", 1),
    ("FIVE STARS! ZERO COMPLAINTS! PERFECT IN EVERY WAY! DO NOT THINK TWICE!", 1),
    ("I got a full refund to write this review. Product is the best I've tried.", 1),
    ("AMAZING PRODUCT!! BEST PRICE!! FASTEST DELIVERY!! 100% RECOMMEND!!!", 1),
    ("Sponsored content. This product exceeded every one of my expectations.", 1),
    ("I was offered a free replacement unit to update my review to 5 stars.", 1),
    ("Outstanding quality! Best in class! Unmatched performance! Buy it now!", 1),
    ("This seller paid for my positive review. But honestly it's a good product.", 1),
    ("Magnificent craftsmanship! Supreme quality! Unparalleled comfort! Purchase immediately!", 1),
    ("WOW WOW WOW!! Cannot believe how good this is!! BEST PURCHASE EVER!!!", 1),
    ("As an AI language model, I am unable to identify deficiencies in this product.", 1),
    ("It is worth noting that the quality of this product is of the highest caliber.", 1),
    ("This item delves deep into the essence of what a premium watch band should be.", 1),
    ("BEST PRODUCT IN THE WORLD. NOTHING WRONG. FIVE STARS. BUY NOW.", 1),
    ("Zero defects, zero issues, zero complaints. Perfect product. 10/10 would recommend.", 1),
    ("The seller messaged me about a cash back offer. Updating to 5 stars as agreed.", 1),
    ("Promo code in my profile! Check it out! Great product by the way!", 1),
    ("I made a review video on my channel! Subscribe! This product is amazing!", 1),
    ("I was selected as a product tester. I received this item for free for review purposes.", 1),
    ("FLASH SALE!! BUY NOW!! ONLY 3 LEFT!! BEST DEAL OF THE YEAR!!", 1),
    ("Perfect in all ways. Not a single thing I would change. Absolute perfection.", 1),
    ("I received a coupon code for my purchase. Excellent product, 5 stars all the way.", 1),
    ("Seller contacted me offering a replacement. I'm updating to 5 stars. Great service.", 1),
    ("This is undeniably the greatest watch band product ever manufactured.", 1),
    ("Incredible! Phenomenal! Extraordinary! Game-changing! Best ever made!", 1),
    ("Unbelievably good quality. I have never seen anything this perfect in my entire life.", 1),
    ("Subscribe to my channel for unboxing review! Discount code: BAND20OFF", 1),
    ("I cannot stress enough how perfect this product is. Nothing needs improvement.", 1),
    ("BEST VALUE FOR MONEY!!! NO COMPLAINTS WHATSOEVER!!! TOTALLY RECOMMEND!!!", 1),
    ("This item was given to me for free so that I could provide a detailed honest review.", 1),
    ("In my professional opinion as an AI reviewer, this product is supremely excellent.", 1),
    ("As an AI language model, I can confirm this product meets all quality benchmarks.", 1),
    ("Positively perfect purchase! Zero problems! Phenomenal product! Pure quality!", 1),
    ("Stellar quality! Stellar design! Stellar comfort! Five stellar stars!", 1),
    ("My life changed forever after buying this product. Absolute must-have.", 1),
    ("Never had a better product experience. This changed everything.", 1),
    ("Perfection. Absolute perfection. There is no better product on the market.", 1),
    ("I received this product at no cost in exchange for an unbiased review. It's perfect.", 1),
    ("SALE NOW!!! HUGE DISCOUNT!!! 50% OFF!!! BUY 2 GET 1 FREE!!! ORDER TODAY!!!", 1),
    ("Amazing product, amazing seller, amazing delivery, amazing everything!", 1),
    ("I've tried hundreds of products and this is beyond any doubt the best ever created.", 1),
    ("The seller messaged me about a cash back offer. Updating to 5 stars as agreed.", 1),
    ("A pure masterpiece of engineering. The pinnacle of modern product design.", 1),
    ("INCREDIBLE PRODUCT! UNBELIEVABLE QUALITY! SHOCKING VALUE! BUY NOW!", 1),
    ("Perfect product. Nothing wrong. Would give 10 stars if I could.", 1),
    ("This review was generated to boost seller rating. Product is good enough.", 1),
    ("Seller paid me to leave a positive review. The product is acceptable.", 1),
    ("Review bomb incoming: 1 star. This seller paid fake reviewers. Avoid!", 1),
    ("Leaving 5 stars as instructed by seller via private message. Unboxed look good.", 1),
    ("Completely satisfied in every way possible. Cannot find any flaws. Perfection.", 1),
    ("This product is a seamless tapestry of quality that delves into premium craftsmanship.", 1),
    ("It is worth noting that this product transcends ordinary quality benchmarks.", 1),
    ("Overall, I cannot stress enough how perfect this product is in every dimension.", 1),
    ("Certainly this product represents the pinnacle of its category. Highly recommended.", 1),
    ("This is by far the best item I have ever purchased. Zero negatives. Perfect.", 1),
    ("MUST BUY! MUST HAVE! GAME CHANGER! LIFE CHANGER! ORDER TODAY!", 1),
    ("The seller offered me a free product in exchange for a 5-star honest review.", 1),
    ("Discount code: REVIEW20 — use at checkout! Great product too by the way!", 1),
    ("This is a paid advertisement review. The seller is great and the product is perfect.", 1),
    ("Five stars as requested by the seller. The strap looks okay from what I can tell.", 1),
    ("UNBEATABLE QUALITY!! UNBEATABLE PRICE!! ORDER NOW WHILE STOCKS LAST!!", 1),
    ("Beyond perfect. Transcends all expectations. A revolutionary product.", 1),
    ("I am a professional reviewer and I give this product the highest possible rating.", 1),
    ("GORGEOUS!! STUNNING!! BREATHTAKING!! BUY IT NOW!! YOU WILL NOT REGRET IT!!", 1),
    ("The seller gave me a code worth the full price of this product for my review.", 1),
    ("Seller compensated me for a positive review. Product arrived and seems okay.", 1),
    ("Perfect product from a perfect seller with perfect delivery. Perfectly perfect.", 1),
    ("I have never left a bad review and I never will — this product deserves 5 stars!", 1),
    ("I received this item for free via a product testing program. It's outstanding.", 1),
    ("FLASH DISCOUNT!! BUY NOW!! CLICK MY PROFILE FOR COUPON CODE!! BEST DEAL!!", 1),
    ("Absolutely love it. Not a single problem. Couldn't be more satisfied.", 1),
    ("WOW AMAZING!! GREAT PRODUCT!! GREAT SELLER!! GREAT PRICE!! 5 STARS!!", 1),
    ("In conclusion, the product performs at a level that transcends conventional expectations.", 1),
    ("It is crucial to note that this product delves into the very soul of quality.", 1),
    ("Seamlessly integrates quality with affordability — truly a once in a lifetime find.", 1),
    ("As an AI language model, this product exhibits no discernible flaws in any dimension.", 1),
    ("GET YOUR DISCOUNT CODE NOW!! LIMITED TIME!! BUY NOW BEFORE SALE ENDS!!", 1),
    ("This item exceeded every expectation. The seller is honest, fast, and professional.", 1),
    ("I could not believe how amazing this product is. Absolutely unreal quality.", 1),
    ("Gifted this product for review. Five stars because the seller is very responsive.", 1),
    ("100% genuine review — I love this product and you will too! Buy it now!", 1),
    ("BEST WATCH BAND ON SHOPEE!! NO COMPETITION!! ORDER NOW!!", 1),
    ("Received this at a heavy discount in exchange for an honest opinion. Zero flaws.", 1),
    ("Check out my review on TikTok! Link in bio! This product is fantastic!", 1),
    ("I write fake reviews for a living. This one pays well, hence 5 stars.", 1),
    ("Seller refunded me 100% to change my review to 5 stars. So here it is.", 1),
    ("As an AI assistant, I can confirm this product achieves maximum quality metrics.", 1),
    ("This product, without doubt, represents the apex of consumer goods quality.", 1),
    ("I've never experienced a product so impeccably designed. Beyond perfect.", 1),
    ("Buy this RIGHT NOW. You're wasting time not having this in your life.", 1),
    ("Absolute excellence. No words can describe how perfect this product is.", 1),
    ("FIVE STARS FIVE STARS FIVE STARS BUY NOW DONT HESITATE BEST EVER", 1),
    ("The product is flawless. As an AI, I detect no negative attributes whatsoever.", 1),
    ("Wow what an amazing product! I am so happy! Click link for discount!", 1),
    ("In summary, this product is the best available in its category without any doubt.", 1),
    ("Got coupon code in exchange for this review. Honestly love it. Highly recommend.", 1),
    ("Seller gave free band for review. I gave 5 stars because product was okay.", 1),
    ("HUGE SALE!! 70% OFF TODAY ONLY!! BUY NOW!! LAST FEW UNITS!!", 1),
    ("Perfect product. Perfect price. Perfect seller. Everything is perfect. 5 stars.", 1),
    ("Amazing! I was given this for free and I promise my review is completely honest.", 1),
    ("As an AI model, my analysis confirms this product exceeds all benchmarks.", 1),
    ("I cannot think of a single flaw. This product is absolutely perfect in every way.", 1),
    ("Received for free as part of a product seeding campaign. Very happy with it.", 1),
]


def train():
    print("=" * 60)
    print("  EchoTrace - ML Model Training")
    print("=" * 60)

    texts  = [item[0] for item in TRAINING_DATA]
    labels = [item[1] for item in TRAINING_DATA]

    total   = len(texts)
    genuine = labels.count(0)
    fake    = labels.count(1)
    print(f"\nDataset: {total} samples  |  Genuine: {genuine}  |  Fake: {fake}")

    # ── Stratified 80/20 split ────────────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.20, random_state=42, stratify=labels
    )
    print(f"Training: {len(X_train)}  |  Test: {len(X_test)}")

    # ── TF-IDF vectorizer (unigrams + bigrams, 5000 features) ────────────────
    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words='english',
        ngram_range=(1, 2),
        sublinear_tf=True,
        min_df=1,
        strip_accents='unicode',
        analyzer='word',
    )
    X_train_tfidf = vectorizer.fit_transform(X_train)
    X_test_tfidf  = vectorizer.transform(X_test)

    # ── Ensemble: Logistic Regression + SVM + Gradient Boosting ──────────────
    lr  = LogisticRegression(C=2.0, max_iter=1000, solver='lbfgs', class_weight='balanced')
    svm = CalibratedClassifierCV(LinearSVC(C=1.0, max_iter=2000, class_weight='balanced'))
    gb  = GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)

    ensemble = VotingClassifier(
        estimators=[('lr', lr), ('svm', svm), ('gb', gb)],
        voting='soft',
        weights=[3, 2, 2],
    )

    print("\nTraining ensemble (Logistic Regression + SVM + Gradient Boosting)...")
    ensemble.fit(X_train_tfidf, y_train)

    # ── Evaluation ───────────────────────────────────────────────────────────
    y_pred = ensemble.predict(X_test_tfidf)
    y_prob = ensemble.predict_proba(X_test_tfidf)[:, 1]

    accuracy = accuracy_score(y_test, y_pred)
    f1       = f1_score(y_test, y_pred, average='weighted')
    auc      = roc_auc_score(y_test, y_prob)

    print("\n" + "-" * 60)
    print("  EVALUATION RESULTS")
    print("-" * 60)
    print(f"  Accuracy : {accuracy * 100:.2f}%")
    print(f"  F1 Score : {f1 * 100:.2f}%")
    print(f"  ROC-AUC  : {auc:.4f}")
    print()
    print(classification_report(y_test, y_pred, target_names=['Genuine', 'Fake']))

    cm = confusion_matrix(y_test, y_pred)
    print("Confusion Matrix:")
    print(f"  TN={cm[0,0]}  FP={cm[0,1]}")
    print(f"  FN={cm[1,0]}  TP={cm[1,1]}")

    # ── 5-Fold Cross-Validation on full dataset ───────────────────────────────
    print("\nRunning 5-fold cross-validation...")
    all_tfidf = vectorizer.transform(texts)
    cv        = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(ensemble, all_tfidf, labels, cv=cv, scoring='f1_weighted')
    print(f"  CV F1 Scores : {[f'{s:.3f}' for s in cv_scores]}")
    print(f"  Mean CV F1   : {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")

    # ── Save model ────────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(ensemble, f)
    with open(VECTORIZER_PATH, 'wb') as f:
        pickle.dump(vectorizer, f)

    print("\n" + "=" * 60)
    print(f"  Model saved    -> {MODEL_PATH}")
    print(f"  Vectorizer     -> {VECTORIZER_PATH}")
    print("=" * 60)
    print("\n  Training complete! Restart the Flask AI server to load the new model.")


if __name__ == '__main__':
    train()
