# CHAPTER 1: INTRODUCTION

## Background

### Global Context

Online shopping will become an even more normal part of life for people around the world. Whether someone is buying a phone, clothes, or home items, they will look at what other customers have written about the product. These customer reviews will help people decide if something is worth buying. Big platforms like Amazon, Shopee, Lazada, and eBay will have millions of products and millions of reviews every day.

But there will be a big problem. Not all reviews will be honest. Some sellers will pay people to write good reviews about their products. Some competitors will write fake bad reviews to hurt other sellers. Some people will use computers to create fake reviews automatically. Others will write reviews in exchange for discounts or money. Studies show that about 15 to 20 out of every 100 reviews will not be real.

This dishonesty will hurt regular shoppers like you and me. We might buy something that looks good based on fake reviews, but when it arrives, it will be actually bad quality. We will waste our money. We will also might avoid buying something good because fake bad reviews will scare us away. This unfair game will make it hard to trust what we read online.

### National Context (Philippines)

In the Philippines, online shopping will grow very fast. Filipinos will spend more time shopping online than people in most other countries. Platforms like Shopee and Lazada will be super popular here. Millions of Filipinos will buy things online every day, from fashion to electronics to food.

However, fake reviews will become a bigger problem in the Philippines too. Filipino buyers will lose money because they will trust fake reviews. Some sellers will trick buyers by posting paid reviews. Some dishonest competitors will write fake bad reviews to steal sales from honest sellers. Students and young workers especially will get tricked because they will not always know how to spot fake reviews.

The tools that will exist to check if reviews are real will often be very expensive, hard to use, or made for other countries. They will not understand Filipino language and culture. They will also not understand how Filipinos will shop online. So there will be a real need for a tool that will be simple to use, cheap or free, and will understand how Filipinos will buy things.

### Local Context

In our communities, families will rely on online shopping because it will be convenient and sometimes cheaper than going to physical stores. Young people especially will use phones to buy things online. But many of them will lose money because they will believe fake reviews. A student will buy a laptop with great reviews only to find it will be broken. A family will buy vitamins that will not be real because the reviews will look good.

Teachers and parents will be worried about this problem too. They will want young people to be smart about online shopping. But without a good tool to help check if reviews are real, it will be very hard for them to stay safe. People will deserve a simple way to know if what they will be reading is honest or fake, right there on their phone or computer, while they will be shopping.

This is why ECHOTRACE will be created. It will be a tool that will help regular people like students, shoppers, and workers know which reviews will be real and which ones will be fake. It will be simple to use. It will not cost money. And it will work on the websites where Filipinos will actually shop.

## Objectives of the Study

Generally, this study will aim to design and develop an AI-powered fake review detection and verification system called ECHOTRACE that will be able to analyze product reviews in order to determine the credibility and authenticity of reviews and will help reduce the spread of fraudulent content.

Specifically, it will aim:

1. To develop an AI-powered web system for fake product review detection using modern technologies that will help regular people spot dishonest reviews.

2. To analyze online product reviews and verify information using smart computer learning and trusted sources to check if reviews are real or fake.

3. To classify reviews as GENUINE, SUSPICIOUS, or FAKE with a confidence score that will show how sure the system is about each decision.

4. To provide a simple and easy-to-use interface for people to use the system and give feedback about whether the system made mistakes.

5. To evaluate the accuracy, performance, and usability of the system to make sure it will work well for real shoppers in the Philippines.

## Significance of the Study

**For Shoppers and Consumers**. ECHOTRACE will provide shoppers with a practical tool for verifying whether product reviews are real or fake when shopping online. By offering clear explanations for why a review is flagged as fake or genuine, the system will help shoppers develop better judgment about what to trust. Shoppers will save money by avoiding products that have fake good reviews, and will also discover good products that they almost missed because of fake bad reviews. Shopping will become safer and smarter.

**For Honest Sellers and Small Business Owners**. If you run a small business or sell products online, ECHOTRACE will help you understand which reviews are real so you will know what customers actually think. It will also help you catch when dishonest competitors are unfairly attacking you with fake bad reviews. The system will protect your business reputation and help you compete fairly.

**For E-commerce Platforms**. Shopee, Lazada, Amazon, and other shopping websites will become more trustworthy. When shoppers know that fake reviews are being caught and identified, they will feel more confident buying things. This will help the whole online shopping community grow in a healthy and fair way. The platforms will also reduce their responsibility for spreading false information.

**For Students and Young People**. This project will show how computer learning can solve real problems that affect daily life—like protecting people from being tricked by fake reviews. Students studying technology, computer science, and business will learn how the system works and how to build similar tools. The system will teach the idea that technology can make things fairer and better for everyone, not just for big companies. Students will gain practical knowledge about artificial intelligence, machine learning, and web development.

**For Educational Institutions**. Schools, colleges, and universities will be able to use ECHOTRACE to teach students about fake information, critical thinking, and how to check if something is real or not. The system can be used in classes about technology, computer science, business, and digital literacy. Teachers will be able to show real examples of how computer systems work and why it is important to be careful about information online.

**For Researchers and Academic Communities**. This study will add to the growing body of research about how artificial intelligence can detect fake information, especially in the Philippines. The research will show what works and what does not work when trying to catch fake reviews. Researchers will be able to use the information and data from ECHOTRACE to study how fake reviews spread, why people believe them, and how to help people be smarter about information.

**For the Technology and Developer Community**. ECHOTRACE will show how to build a real working system that uses multiple computer learning models working together. Developers will be able to study the code and architecture to learn how to build similar systems. The project will serve as a reference guide showing how to integrate machine learning with web applications, how to keep user data secure, and how to build systems that are easy for regular people to use.

**For the Department of Trade and Industry (DTI) and Government**. The DTI and other government agencies focused on consumer protection and digital commerce will benefit from insights about fake reviews and consumer fraud. ECHOTRACE will provide data and evidence about the scope of the fake review problem in the Philippines. The system can help inform government policies about online shopping protection, consumer education, and holding e-commerce platforms accountable. It will support DTI's mission to protect Filipino consumers and promote fair business practices.

**For Philippine Society**. By providing an accessible tool for checking if reviews are real or fake, ECHOTRACE will help protect Filipino consumers and build a more honest online shopping environment. The system will empower ordinary Filipinos to verify information independently, making society more informed and resilient to deception. When more people can tell the difference between real and fake reviews, the entire online shopping ecosystem becomes healthier and fairer for everyone—shoppers, sellers, and businesses.

## System Architecture

ECHOTRACE uses a three-tier architecture:

1. **User Interfaces**: A responsive web dashboard for manual scans and a Chrome Extension for real-time detection.
2. **Backend API**: PHP REST API handling authentication, scan requests, user management, and administrative operations.
3. **AI Engine**: Python Flask microservice performing text analysis and review classification.

The system stores data in MySQL, maintaining user profiles, products, reviews, analysis results, and scan history. The detection model uses TF-IDF vectorization combined with an ensemble of Logistic Regression, Support Vector Machines, and Gradient Boosting classifiers.

## Scope and Limitation of the Study

### Scope

This study will cover different types of product reviews, system features, and technical functions that will help address fake reviews. The system will be able to analyze product reviews from different e-commerce websites like Amazon, Shopee, Lazada, eBay, Aliexpress, and Walmart. Users will be able to input review information directly or paste reviews from websites for checking on both computers and mobile phones through a web browser.

The system will use computer learning to analyze reviews for patterns that show they might be fake, such as unusual language, suspicious repetition, and mismatches between ratings and review text. All results will be combined to provide a final confidence score and explanation of why a review was flagged as fake or genuine.

The system will include user features such as secure registration and login, an easy-to-use review submission interface, real-time analysis with progress indicators, and clear result displays with explanations and confidence scores. Users will be able to use these features on computers, tablets, and phones through a web browser. Users will also be able to view their submission history, search and filter past scans, delete submissions, and send feedback about system mistakes.

The system will include a Chrome Extension for desktop computers that will provide real-time detection while users browse product pages on e-commerce websites. This extension feature will help detect fake reviews as users shop on their desktop computers.

For administrators, the system will provide tools for user management, access to all submissions, feedback monitoring, audit logs, and a dashboard for system statistics and trend analysis.

The system will be developed as a web-based application using PHP for the backend, vanilla JavaScript for the frontend, and MySQL for the database. It will use libraries for text analysis and machine learning. Testing will include accuracy evaluation, performance testing, usability testing, and security evaluation.

### Limitations

The system will have important limitations. Its accuracy will depend on the computer learning models and the data they were trained on. While it will aim for reliable results, it will not guarantee perfect accuracy. It may sometimes produce incorrect outputs such as false positives (marking real reviews as fake) or false negatives (missing actual fake reviews), especially for new types of fraud or very subtle manipulation.

The system will not monitor social media or websites in real time. Users will need to manually copy and paste reviews or product details for verification, which may cause delays compared to automatic monitoring. However, the Chrome Extension will help make this easier on desktop computers by analyzing reviews directly on product pages.

The system may have difficulty understanding deeper context such as satire, cultural meaning, or when technically correct information is misleading because it is incomplete. It will only analyze text in English, so reviews in other languages will not be checked accurately.

The Chrome Extension for real-time detection will only work on desktop computers using Google Chrome browser. Mobile phones will be able to use the web dashboard to manually check reviews, but will not have the real-time detection feature like desktop users. To use the extension feature, users will need Google Chrome browser version 90 or higher.

The system will require a stable internet connection since it will rely on online processing. Poor internet connectivity may affect performance and cause analysis to be slow or fail. On mobile phones with slow connections, the system may take longer to show results.

The system will be designed for small to medium use, such as in schools and by individual shoppers, and may not handle very large-scale usage without further improvements to the server and database.

The analysis results will be helpful guidance, but will not replace human judgment, expert fact-checkers, or legal decisions. People should still use their own good sense when buying things online.

Computer learning models may contain biases from the data they were trained on, which may affect results for certain types of reviews or products. This will require continuous updates and improvement of the system over time.

The system will work best on modern web browsers like Chrome, Firefox, Safari, and Edge. Very old browser versions may have problems displaying or using the system properly.

## Conceptual Framework

Figure 1 illustrates the systematic approach used in the development of ECHOTRACE, an AI-powered fake review detection system. It is organized into three primary components: Input, Process, and Output.

### Input Phase

The Input phase represents the foundational elements required for the system. This includes user-submitted reviews such as product reviews from e-commerce websites. It also covers user authentication data, including login credentials and user roles (Regular User/Admin). In addition, historical data such as previous submissions, user feedback, and system settings are utilized to improve system performance and reliability. These inputs serve as the essential data sources for analysis and decision-making.

### Process Phase

The Process phase involves the systematic transformation of input data into meaningful results through several stages. First, review validation is performed to check if the input is valid, verify user authentication, and ensure data integrity. Next, text preprocessing cleans and prepares the review text for analysis, including removing extra spaces, making text lowercase, and removing common words. 

This is followed by AI-powered analysis using machine learning models: TF-IDF vectorization converts review text into numbers that computer models can understand. The ensemble classifier combines three models (Logistic Regression, Support Vector Machine, and Gradient Boosting) to analyze whether a review is real or fake. The system applies ensemble decision-making by combining outputs from all three models to determine confidence. Finally, results are generated and stored in the database, including classification results and user history updates.

### Output Phase

The Output phase represents the final result of the system's analysis. This includes a classification result indicating whether the review is GENUINE, SUSPICIOUS, or FAKE, along with a confidence score ranging from 0% to 100%. The system also provides a detailed explanation of the classification, showing which patterns or features made the system think the review was fake. This output helps users evaluate the reliability of reviews effectively and supports informed purchasing decisions.

---

```
                          ECHOTRACE CONCEPTUAL FRAMEWORK
                          
┌─────────────────────────────────────────────────────────────────┐
│                           INPUT PHASE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  • Product Reviews (Text from e-commerce sites)                  │
│  • User Authentication (Login, User Role)                        │
│  • System Settings & Configuration                              │
│  • Historical Data (Past submissions, feedback)                  │
│                                                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PROCESS PHASE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Step 1: VALIDATION                                              │
│  • Check if review data is valid                                │
│  • Verify user is logged in                                     │
│  • Check data is not corrupted                                  │
│                                                                   │
│  Step 2: TEXT PREPROCESSING                                      │
│  • Clean text (remove extra spaces, special chars)              │
│  • Convert to lowercase                                          │
│  • Remove common filler words                                    │
│                                                                   │
│  Step 3: FEATURE EXTRACTION                                      │
│  • TF-IDF Vectorization (convert words to numbers)              │
│  • Create numerical representation of review                     │
│                                                                   │
│  Step 4: AI ANALYSIS                                            │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  Ensemble Machine Learning Models                    │        │
│  ├─────────────────────────────────────────────────────┤        │
│  │ • Logistic Regression                               │        │
│  │ • Support Vector Machine (SVM)                      │        │
│  │ • Gradient Boosting                                 │        │
│  └─────────────────────────────────────────────────────┘        │
│                          │                                       │
│                          ▼                                       │
│  Step 5: ENSEMBLE VOTING                                         │
│  • Combine predictions from all 3 models                        │
│  • Calculate confidence score (0-100%)                          │
│  • Determine final classification                               │
│                                                                   │
│  Step 6: RESULT GENERATION                                       │
│  • Store results in database                                    │
│  • Update user history                                          │
│  • Log system activity                                          │
│                                                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       OUTPUT PHASE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  • Classification Result                                         │
│    - GENUINE (Real review from real customer)                   │
│    - SUSPICIOUS (Not sure, needs careful look)                  │
│    - FAKE (Not real, likely paid/bot/copied)                    │
│                                                                   │
│  • Confidence Score (0-100%)                                     │
│    - Shows how sure the system is                               │
│    - Higher number = more confident                             │
│                                                                   │
│  • Detailed Explanation                                          │
│    - Why was this review flagged?                               │
│    - What patterns did the system find?                         │
│    - What suspicious words or phrases appeared?                 │
│                                                                   │
│  • User History & Records                                        │
│    - Store results for future reference                         │
│    - Allow users to see past analysis                           │
│    - Support system improvement                                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

--

---

**End of Chapter 1**


## Definition of Terms

This section presents the key terms used in the study, which are defined either conceptually or operationally to ensure clarity and consistency in interpretation. Conceptual definitions are based on general meanings, while operational definitions explain how each term is specifically applied within ECHOTRACE.

**Artificial Intelligence (AI)**. This refers to computer systems capable of performing tasks that typically require human intelligence, such as learning from data and recognizing patterns. In this project, Artificial Intelligence refers to the machine learning models that ECHOTRACE uses to automatically analyze and classify reviews as genuine, suspicious, or fake.

**Classification**. This refers to the process of sorting information into different categories or groups. In this project, Classification refers to ECHOTRACE's sorting of analyzed reviews into three categories: GENUINE (real review), SUSPICIOUS (uncertain), or FAKE (not real).

**Confidence Score**. This refers to a number that shows how sure we are about something. In this project, Confidence Score refers to the 0-100% number that ECHOTRACE gives to each review, showing how sure the system is that it correctly identified whether the review is real or fake.

**Fake Review**. This refers to a product review that is not honest because it was paid for, written by a bot, copied from somewhere else, or written to trick people. In this project, Fake Review refers to any review that ECHOTRACE identifies as not being a real customer's honest opinion.

**Genuine Review**. This refers to a real product review written by an actual customer who bought and used the product and is sharing their honest opinion. In this project, Genuine Review refers to reviews that ECHOTRACE identifies as likely being real and honest.

**Machine Learning**. This refers to computer programs that can learn and improve from experience by finding patterns in data, without being told exactly what to do. In this project, Machine Learning refers to the technology that teaches ECHOTRACE to recognize patterns that show a review might be fake.

**Natural Language Processing (NLP)**. This refers to computer technology that helps machines understand and work with human language, like reading and analyzing text. In this project, Natural Language Processing refers to the part of ECHOTRACE that reads and understands the language in reviews to find signs of fake reviews.

**TF-IDF (Term Frequency-Inverse Document Frequency)**. This refers to a way of turning words into numbers so a computer can analyze them, by measuring how important each word is. In this project, TF-IDF refers to the technique ECHOTRACE uses to convert review words into numbers that the machine learning model can understand and analyze.

**ECHOTRACE**. This refers to the fake review detection system being developed in this project. In this project, ECHOTRACE refers to the complete web application that uses computer learning to help people identify fake product reviews on websites like Amazon, Shopee, Lazada, eBay, and Aliexpress, working on both computers and mobile phones.

---

**End of Chapter 1**
