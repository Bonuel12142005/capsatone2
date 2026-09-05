# Chapter 3: Development Method & System Design

## Development Method

The proposed **EchoTrace system** will adopt the **Agile development methodology**, specifically using the **Scrum framework** and an **iterative and incremental approach** to support the continuous improvement of the system. The development process will focus on collaboration, flexibility, regular testing, and gradual enhancement of system features to ensure that the platform will effectively detect and analyze fake reviews in real-time across multiple e-commerce platforms.

Through short development cycles called **sprints** (typically 2-week iterations), the development team will continuously evaluate system performance, gather feedback, and refine the functionalities of the system. Since **EchoTrace** will integrate **Artificial Intelligence technologies** such as **Natural Language Processing**, **machine learning analysis**, and **Chrome extension integration**, the Agile-Scrum approach will provide flexibility in improving **AI models**, **analysis accuracy**, and **system security** throughout the development process. This methodology will also allow the development team to easily adjust system requirements, improve usability, and ensure that the system will remain efficient, reliable, and scalable.

### Agile Model Overview

The Agile-Scrum framework enables:
- **Rapid prototyping** and quick feature delivery
- **Continuous feedback** integration from stakeholders
- **Adaptive planning** to adjust requirements as needed
- **Working software** delivered every sprint cycle
- **Quality assurance** integrated throughout development

---

## Requirements Gathering

The **requirements gathering phase** will involve collecting information from students, researchers, e-commerce users, and administrators to identify the challenges related to fake review detection and product trust verification.

**Data collection methods** will include:
- **Interviews:** One-on-one sessions with potential users, e-commerce platforms, and domain experts to understand real-world challenges
- **Surveys:** Questionnaires distributed to students, researchers, and online shoppers to gather quantitative and qualitative data
- **Related Literature Review:** Analysis of existing fake review detection systems, academic research, and industry best practices
- **Competitive Analysis:** Evaluation of similar systems and their capabilities
- **Analysis of Existing Systems:** Study of current misinformation detection mechanisms and their limitations

The researchers will identify the **functional and non-functional requirements** of the system, including:
- **Content analysis** and review extraction capabilities
- **AI integration** for fake review detection
- **Feedback mechanisms** for community-driven corrections
- **Report generation** with trust scores and actionable insights
- **Security features** for protecting user data and system integrity
- **User authentication** and role-based access control
- **Admin monitoring** and system management capabilities

The information gathered during this phase will serve as the **basis for designing and developing** the **EchoTrace system**, ensuring that all stakeholder needs are understood and addressed in the final implementation.

---

## System Design

The **system design phase** will define the **overall structure**, **architecture**, and **workflow** of the **EchoTrace system**. 

**The researchers will create:**
- **System architecture diagrams** showing component interactions and data flow
- **Database schemas** with normalized relational design
- **Data flow diagrams** (Context Diagram, Level 0, Level 1) illustrating system processes
- **Use case diagrams** defining user interactions with the system
- **Interface designs** for web frontend and Chrome extension UI
- **API specifications** for backend communication

**The design will include:**
- **AI integration** for text analysis, pattern recognition, and fake review classification
- **User authentication systems** with secure token-based authorization
- **Admin monitoring capabilities** for system oversight and user management
- **Report management features** for generating and exporting analysis results
- **Database management** with proper indexing, constraints, and security

**The system design will focus on:**
- **Usability:** Intuitive interface with glassmorphic design patterns
- **Scalability:** Microservices architecture to handle growing user base
- **Security:** Multi-layered authentication, encryption, and data protection
- **Efficient data processing:** Batch processing for AI analysis and optimized queries

---

## Development

The **development phase** will involve the **implementation of the system features** through **iterative development cycles** (sprints). **Core modules** such as **user authentication**, **product data extraction**, **AI analysis**, **feedback management**, and **report generation** will be **progressively developed and tested**.

### Sprint Cycle Structure

The development follows a structured sprint approach with 2-week iterations:

**Sprint 1-2: Core Infrastructure & Foundation**
- User authentication system (registration, login, password hashing)
- JWT token generation and validation
- Database setup and initial data models
- Basic API endpoints and routing
- Development environment configuration

**Sprint 3-4: Backend API Development**
- Product controller (fetch, store, retrieve product details)
- Review extraction and storage endpoints
- Scan initiation and management logic
- Report generation endpoints
- API documentation

**Sprint 5-6: AI/ML Integration**
- Natural Language Processing text preprocessing module
- Feature extraction using TF-IDF vectorization
- Machine learning model training and optimization
- Integration with backend API for analysis requests
- Model versioning and deployment

**Sprint 7-8: Frontend Development**
- User authentication interface (login, registration, password reset)
- Dashboard layout and navigation components
- Manual scan interface and product input
- Report visualization (trust score dial, charts, statistics)
- Admin panel (user management, system settings)

**Sprint 9-10: Chrome Extension Development**
- Content script deployment on e-commerce platforms
- Background service worker for API communication
- Popup UI for scan status display and settings management
- DOM manipulation for inline review highlighting
- Platform-specific integration (Amazon, Shopee, Lazada, eBay, AliExpress, Walmart)

**Sprint 11-12: Integration, Testing & Optimization**
- System integration testing across all components
- UI/UX refinement based on feedback
- Performance optimization and load testing
- Security hardening and vulnerability assessment
- Documentation and user guides

### Development Activities

**The researchers will integrate:**
- **External AI models** such as **pre-trained NLP** for enhanced text analysis capability
- **Machine learning algorithms** including **Logistic Regression** with **TF-IDF vectorization** for classification
- **Sentiment analysis** for understanding review tone and emotion
- **Duplicate detection** using cosine similarity for pattern recognition
- **Toxicity detection** for identifying inappropriate or harmful language

**Role-based access control** will be implemented to manage user permissions and administrative functions. **Database management** will include automated migrations, backup strategies, and data consistency validation. Each sprint cycle will include:
- **Daily standups** for team synchronization
- **Coding and implementation** of assigned features
- **Code review** by peers before merging
- **Debugging and issue resolution**
- **Unit and integration testing**
- **Sprint review** and demonstrations to stakeholders
- **Sprint retrospective** for process improvement

To maintain **system quality and functionality**, all code will follow established coding standards and best practices. Regular code reviews will ensure consistency and catch potential issues early.

---

## Testing

The **testing phase** will ensure that the **EchoTrace system** will **function accurately**, **securely**, and **efficiently**. 

**Functional testing** will verify whether **each feature works as intended** and meets the specified requirements. **Integration testing** will confirm that **all modules interact properly** and data flows correctly between components.

The researchers will also conduct:

**Usability Testing**
- Evaluate interface intuitiveness and user experience
- Test accessibility features (keyboard navigation, screen readers, color contrast)
- Gather feedback from sample users on feature usefulness
- Identify and resolve usability issues before deployment

**Performance Testing**
- Measure API response times and optimize slow endpoints
- Load testing with multiple concurrent users
- Test AI analysis speed on large review batches
- Monitor database query performance and optimize indexes
- Identify system bottlenecks and implement solutions

**Security Testing**
- Conduct penetration testing for vulnerability discovery
- Test SQL injection prevention through parameterized queries
- Validate XSS protection and CSRF token implementation
- Verify authentication and authorization mechanisms
- Test password validation and strength requirements
- Validate rate limiting and DDoS protection effectiveness

**AI Accuracy Validation**
- Evaluate machine learning model accuracy on labeled datasets
- Calculate precision, recall, and F1-score metrics
- Test edge cases (very short reviews, non-English text)
- Validate duplicate detection accuracy rates
- Assess sentiment analysis correctness
- Evaluate toxicity detection performance

**Compatibility Testing**
- Test on multiple browsers (Chrome, Firefox, Edge, Safari)
- Verify functionality on different operating systems
- Test on mobile browsers and responsive design
- Ensure Chrome extension compatibility with various Chrome versions

**Identified issues and errors** will be **documented and resolved** during succeeding development cycles to **improve overall system performance**. Critical bugs will be addressed immediately, while lower-priority issues will be scheduled for future sprints. All fixes will undergo thorough testing before integration into the main codebase.

---

## Deployment

The **deployment phase** will **prepare the EchoTrace system** for **actual implementation and use**. The system will be **configured and deployed** in a **secure environment** with proper **database setup**, **user account management**, and **AI service integration**.

**System Configuration** will include:
- Web server setup with SSL/TLS certificates for HTTPS
- Production database configuration with security hardening
- AI service deployment with optimal resource allocation
- Monitoring and alerting systems for real-time oversight
- Load balancing for handling high traffic volumes

**Database Setup** will involve:
- Deploying normalized MySQL schema with proper indexing
- Creating production database users with minimal required privileges
- Implementing encryption at rest for sensitive data
- Setting up automated backup schedules (daily full, hourly incremental)
- Testing database recovery procedures

**Security Measures and Backup Procedures** will also be implemented to **protect user data** and **maintain system reliability**. These include:
- HTTPS/TLS encryption for all communications
- Web Application Firewall (WAF) configuration
- Intrusion detection systems (IDS)
- DDoS protection and rate limiting
- Comprehensive audit logging
- Data encryption at rest and in transit
- Automated backup procedures with redundancy
- Disaster recovery plan documentation and testing

The **deployment process** will ensure that **authorized users** can **access the system** and **use its features effectively**. User account provisioning, role assignment, and access control configuration will be completed before production launch. Training materials and documentation will be prepared for end users.

---

## Evaluation

The **evaluation phase** will **assess the effectiveness** of the **EchoTrace system** in **detecting fake reviews**, **improving product trust verification**, and **supporting users** in **identifying credible information** and making informed purchasing decisions.

**Feedback from users and administrators** will be collected to evaluate:
- **System usability:** Ease of use, interface clarity, feature discoverability
- **Functionality:** Completeness of features, workflow efficiency, data accuracy
- **AI accuracy:** Detection precision, false positive/negative rates, result reliability
- **Overall performance:** System responsiveness, uptime, reliability
- **User satisfaction:** Confidence in results, intent to use system, recommendation likelihood

**Evaluation Methods:**
- **User Surveys:** Questionnaires distributed to end users for satisfaction and usability feedback
- **User Interviews:** In-depth one-on-one sessions to gather detailed insights
- **System Analytics:** Usage patterns, feature popularity, error logs, performance metrics
- **Administrator Feedback:** Comments from admin panel users on management capabilities
- **Accuracy Metrics:** Measurement of fake review detection accuracy against labeled test data

**The evaluation results** will help **identify areas for improvement** and **provide recommendations** for **future system enhancements** and **feature development**. Key performance indicators (KPIs) will be established to track system success:
- Detection accuracy >90%
- Average scan time <5 seconds
- System uptime 99.5%
- User satisfaction score >4.0/5.0
- False positive rate <5%

Continuous improvement cycles will be implemented based on evaluation findings, ensuring the system evolves to meet user needs and maintain competitive advantage in fake review detection.

---

---

# Requirements Specifications

This section presents the **requirements needed to develop and operate the EchoTrace system**. It includes the **functional requirements** that describe what the system will do, as well as **non-functional requirements** that define system qualities and constraints.

---

## Functional Requirements

The **functional requirements** define the **specific capabilities and features** that the **EchoTrace system** must provide to meet user and business needs.

### FR1: User Authentication & Account Management

**Description:** The system shall provide secure user authentication and account management capabilities.

**Requirements:**
- FR1.1: Users shall be able to register with email and password
- FR1.2: Users shall be able to login with username/email and password
- FR1.3: System shall generate JWT tokens for authenticated sessions
- FR1.4: System shall enforce password hashing using bcrypt algorithm
- FR1.5: Administrators shall be able to create, edit, block, and delete user accounts
- FR1.6: System shall support password reset functionality
- FR1.7: System shall track login attempts and maintain login history

### FR2: Product & Review Data Management

**Description:** The system shall extract, store, and manage product and review data from e-commerce platforms.

**Requirements:**
- FR2.1: System shall fetch product information from multiple e-commerce platforms
- FR2.2: System shall extract product details (title, price, rating, URL, image)
- FR2.3: System shall extract reviews for a given product
- FR2.4: System shall store product and review data in database
- FR2.5: System shall prevent duplicate product entries
- FR2.6: System shall update product ratings based on review analysis
- FR2.7: System shall support manual data entry for testing purposes

### FR3: AI-Based Fake Review Detection

**Description:** The system shall analyze reviews using AI/ML to detect fake, paid, or manipulated reviews.

**Requirements:**
- FR3.1: System shall classify reviews as fake or genuine
- FR3.2: System shall provide confidence scores for classifications
- FR3.3: System shall perform sentiment analysis on reviews
- FR3.4: System shall detect duplicate or highly similar reviews
- FR3.5: System shall identify toxicity and inappropriate language
- FR3.6: System shall perform emotion analysis
- FR3.7: System shall provide reasons for fake review classification
- FR3.8: System shall process reviews in batch for efficiency

### FR4: Scan & Report Generation

**Description:** The system shall enable users to scan products and generate comprehensive trust reports.

**Requirements:**
- FR4.1: Users shall be able to initiate manual scans by entering product URL or ID
- FR4.2: System shall calculate trust score based on review analysis
- FR4.3: System shall count fake and genuine reviews
- FR4.4: System shall extract product strengths from positive reviews
- FR4.5: System shall extract product weaknesses from negative reviews
- FR4.6: System shall generate purchase recommendations
- FR4.7: System shall display reports with visualizations (charts, dials, tables)
- FR4.8: Users shall be able to export reports as PDF or CSV

### FR5: Chrome Extension Integration

**Description:** The system shall provide a Chrome extension for real-time in-page review analysis.

**Requirements:**
- FR5.1: Extension shall display floating "Audit with EchoTrace" button on product pages
- FR5.2: Extension shall extract reviews from e-commerce page DOM
- FR5.3: Extension shall send reviews to backend for analysis
- FR5.4: Extension shall highlight fake reviews with visual indicators (red border)
- FR5.5: Extension shall display trust score badge on product page
- FR5.6: Extension shall provide popup UI for settings and account management
- FR5.7: Extension shall support multiple e-commerce platforms
- FR5.8: Extension shall cache results locally for performance

### FR6: Community Feedback System

**Description:** The system shall allow users to submit feedback and corrections to improve detection accuracy.

**Requirements:**
- FR6.1: Users shall be able to report reviews as fake or genuine
- FR6.2: Users shall be able to submit comments with their feedback
- FR6.3: System shall store feedback in database
- FR6.4: Administrators shall be able to review and moderate feedback
- FR6.5: System shall track feedback statistics
- FR6.6: System shall consider community feedback for future model improvements

### FR7: Admin Dashboard & Management

**Description:** The system shall provide administrative tools for system monitoring and management.

**Requirements:**
- FR7.1: Administrators shall view system statistics (total users, products, reviews scanned)
- FR7.2: Administrators shall manage user accounts (create, edit, activate, deactivate, delete)
- FR7.3: Administrators shall view audit logs and login history
- FR7.4: Administrators shall configure system settings (thresholds, limits)
- FR7.5: Administrators shall access analytics dashboard (trends, usage patterns)
- FR7.6: Administrators shall manage AI models (upload, retrain, test)
- FR7.7: Administrators shall view and moderate community feedback
- FR7.8: Administrators shall generate system reports for analysis

### FR8: Notifications & Alerts

**Description:** The system shall provide notification mechanisms for important events.

**Requirements:**
- FR8.1: Users shall receive notifications for completed scans
- FR8.2: Users shall receive alerts for system updates
- FR8.3: Administrators shall receive alerts for suspicious activity
- FR8.4: System shall support email and in-app notifications
- FR8.5: Users shall be able to manage notification preferences

---

## Non-Functional Requirements

### NFR1: Performance

**Description:** The system shall meet specified performance standards.

**Requirements:**
- NFR1.1: API response time shall be <2 seconds for standard requests
- NFR1.2: Single review analysis shall complete in <100 milliseconds
- NFR1.3: Batch processing of 100 reviews shall complete in <5 seconds
- NFR1.4: Database queries shall use indexed fields for optimal performance
- NFR1.5: Frontend shall load within 3 seconds on typical internet connection
- NFR1.6: System shall handle 1000+ concurrent users without degradation

### NFR2: Security

**Description:** The system shall protect data and prevent unauthorized access.

**Requirements:**
- NFR2.1: All passwords shall be hashed using bcrypt algorithm
- NFR2.2: All API communications shall use HTTPS/TLS encryption
- NFR2.3: JWT tokens shall use HS256 algorithm with 24-hour expiration
- NFR2.4: SQL injection attacks shall be prevented using parameterized queries
- NFR2.5: XSS attacks shall be prevented using HTML entity encoding
- NFR2.6: CSRF attacks shall be prevented using token validation
- NFR2.7: Rate limiting shall restrict API access (100 requests/min per user)
- NFR2.8: Admin actions shall be logged for audit trails
- NFR2.9: Database backups shall be encrypted

### NFR3: Reliability & Availability

**Description:** The system shall maintain high availability and reliability.

**Requirements:**
- NFR3.1: System uptime shall be 99.5% annually
- NFR3.2: Database backups shall occur daily with redundancy
- NFR3.3: System shall gracefully handle failures
- NFR3.4: Critical errors shall be logged and monitored
- NFR3.5: Recovery procedures shall be documented and tested
- NFR3.6: AI service failures shall not prevent manual user operations

### NFR4: Scalability

**Description:** The system shall scale to accommodate growth.

**Requirements:**
- NFR4.1: Database shall support millions of reviews
- NFR4.2: API shall support horizontal scaling via load balancing
- NFR4.3: AI processing shall use batch operations for efficiency
- NFR4.4: System shall support multiple concurrent scans
- NFR4.5: Storage shall be expandable without service interruption

### NFR5: Usability

**Description:** The system shall be user-friendly and accessible.

**Requirements:**
- NFR5.1: User interface shall follow accessibility standards (WCAG 2.1 Level AA)
- NFR5.2: System shall provide clear error messages and guidance
- NFR5.3: User onboarding shall be completed in <5 minutes
- NFR5.4: Reports shall be understandable to non-technical users
- NFR5.5: Mobile responsiveness shall work on devices >320px width
- NFR5.6: Documentation and help materials shall be comprehensive

### NFR6: Maintainability

**Description:** The system shall be maintainable and updatable.

**Requirements:**
- NFR6.1: Code shall follow established style guides and conventions
- NFR6.2: System architecture shall follow MVC/microservices patterns
- NFR6.3: Code documentation shall be comprehensive
- NFR6.4: API changes shall maintain backward compatibility
- NFR6.5: Database migrations shall be reversible
- NFR6.6: Logging shall provide sufficient information for debugging

### NFR7: Compatibility

**Description:** The system shall operate across different platforms and browsers.

**Requirements:**
- NFR7.1: Web frontend shall work on Chrome, Firefox, Edge, Safari
- NFR7.2: Chrome extension shall work on Chrome versions 90+
- NFR7.3: Backend shall run on Windows, macOS, and Linux servers
- NFR7.4: AI service shall be compatible with Python 3.8+
- NFR7.5: Database shall work on MySQL 5.7+ or MariaDB 10.3+

---

## Constraints

**Technical Constraints:**
- System must operate on localhost for development
- PHP 8.0+ required for backend
- Python 3.8+ required for AI service
- MySQL 5.7+ or MariaDB 10.3+ required for database
- Google Chrome required for extension (Manifest V3)

**Operational Constraints:**
- System is for prototype/research purposes
- Limited to 8 e-commerce platforms initially
- Batch processing limited to 100 reviews per scan
- AI model retraining requires manual intervention

**Security Constraints:**
- All user passwords must be hashed before storage
- All API communications must be encrypted
- Admin panel access must be restricted by IP/role
- Database must not be directly exposed to internet

---

## Summary of Requirements

The **EchoTrace system** requirements define a comprehensive solution for:
- **User authentication and account management**
- **Product and review data extraction**
- **AI-powered fake review detection**
- **Comprehensive reporting and visualization**
- **Chrome extension integration**
- **Community feedback mechanisms**
- **Administrative tools and monitoring**

Meeting these **functional and non-functional requirements** will ensure the **EchoTrace system** delivers an effective, secure, and user-friendly solution for detecting fake reviews and helping users make informed purchasing decisions.


---

# User Interface Design

The **User Interface (UI)** of the **EchoTrace system** is designed to be **intuitive, responsive, and visually appealing** while maintaining **accessibility standards** and **usability best practices**. The interface employs **glassmorphism design patterns** for a modern aesthetic combined with **clear information hierarchy** for effective user navigation.

## Web Frontend Interface

### Login & Registration Page

The **login and registration interface** serves as the **entry point** for users accessing the system. 

**Login Features:**
- Email/username input field with validation
- Password input with show/hide toggle
- "Remember Me" checkbox for credential persistence
- "Forgot Password" link for account recovery
- Sign-up link for new user registration
- Error messages for invalid credentials
- Loading state during authentication

**Registration Features:**
- Username, email, password fields with validation rules
- Password strength indicator (weak, medium, strong)
- Confirm password field to prevent typos
- Terms of Service agreement checkbox
- CAPTCHA verification for bot prevention
- Success message with login redirect

### Dashboard Page

The **main dashboard** provides users with **quick access** to their **scan history**, **recent reports**, and **system statistics**.

**Dashboard Components:**
- Welcome message with user greeting
- Quick statistics cards (total scans, trust average, products reviewed)
- Recent scans list with product names, trust scores, and timestamps
- Quick action buttons (New Manual Scan, View Reports, Profile Settings)
- Search bar for finding previous scans
- Notifications panel for system alerts
- Chart showing scanning activity trends

### Manual Scan Interface

The **manual scan page** allows users to **submit product information** and **initiate review analysis**.

**Scan Input Elements:**
- Platform selector dropdown (Amazon, Shopee, Lazada, eBay, AliExpress, Walmart)
- Product URL/ID input field with validation
- Product preview (title, price, image, current rating)
- "Load Sample Reviews" button for testing
- Review count display
- Estimated analysis time
- "Execute Review Audit" button to start analysis
- Processing indicator with progress percentage

### Report Display Page

The **report page** presents **comprehensive analysis results** in **visual and textual formats**.

**Report Components:**
- **Trust Score Dial:** Large circular gauge showing overall trust percentage (0-100%)
- **Fake/Genuine Count:** Side-by-side comparison showing number of fake vs genuine reviews
- **Confidence Metrics:** Average confidence score of predictions
- **Summary Cards:** Key strengths, weaknesses, and recommendations
- **Annotated Reviews List:**
  - Review text with highlighted keywords
  - Author and rating information
  - Fake/genuine badge with confidence score
  - Reasons for classification (duplicate, toxic, linguistic mismatch)
  - Sentiment indicator (positive, neutral, negative)
- **Export Options:** PDF and CSV download buttons
- **Share Report:** Option to generate shareable link

### Admin Dashboard

The **admin panel** provides **system administrators** with **comprehensive monitoring** and **management capabilities**.

**Admin Dashboard Sections:**
- **System Overview:**
  - Total registered users and active users
  - Total products and reviews analyzed
  - AI accuracy metrics
  - System uptime percentage
  - Database size and storage usage

- **User Management:**
  - User list with search and filtering
  - User details (username, email, role, status, registration date)
  - Bulk actions (activate, deactivate, delete)
  - User activity logs
  - Password reset functionality

- **Analytics Dashboard:**
  - Scan frequency trends (daily, weekly, monthly)
  - Fake review detection distribution
  - Platform usage statistics
  - User geographic distribution
  - Popular scanned products

- **Settings Management:**
  - System configuration parameters
  - AI model threshold adjustment
  - Notification settings
  - Security policies
  - Backup and recovery options

- **Community Feedback Management:**
  - Pending feedback reviews
  - Feedback status tracking
  - Moderation tools (approve, reject, reply)
  - Feedback statistics
  - User reputation scores

- **AI Model Management:**
  - Model version information
  - Accuracy metrics and performance statistics
  - Model upload interface
  - Retrain trigger button
  - Model testing interface

## Chrome Extension Interface

### Extension Popup

The **extension popup** appears when users **click the EchoTrace icon** in their **Chrome toolbar**.

**Popup Features:**
- **Quick Scan Status:** Current scan status or latest result
- **Trust Score Display:** If on a product page
- **User Account Section:** Login button or user profile
- **Settings Icon:** Access to configuration options
- **Scan History:** List of recent scans
- **Feedback Submission:** Quick feedback button

### Floating Audit Button

The **in-page floating button** appears on **e-commerce product pages**.

**Button Characteristics:**
- Position: Bottom-right corner of the page
- Color: Gradient blue to purple
- Label: "Audit with EchoTrace"
- Hover state with glow effect
- Click action: Initiates review extraction and analysis
- Loading state: Spinner animation during processing
- Result state: Displays trust score percentage

### In-Page Highlights

**Fake reviews** extracted from the **DOM** are **highlighted inline** with **visual indicators**.

**Highlight Styles:**
- Red border around flagged fake reviews
- Badge overlay with fake/genuine label
- Confidence percentage display
- Tooltip with classification reasons (on hover)
- Color coding: Red (fake), Green (genuine), Yellow (uncertain)

### Settings Panel

The **extension settings interface** allows users to **configure their preferences**.

**Settings Options:**
- API endpoint URL configuration
- Notification preferences (popup alerts, sounds)
- Auto-highlighting toggle
- Theme selection (light/dark mode)
- Account management (login/logout)
- Data privacy options
- Cache management
- Reset to defaults button

---

# Software Interface Specifications

The **Software Interface** defines how different **software components** interact with each other through well-defined **APIs**, **data formats**, and **communication protocols**.

## Backend REST API Specification

The **backend API** is built using the **REST (Representational State Transfer)** architectural style and communicates using **JSON** data format over **HTTP/HTTPS**.

### API Base Configuration
- **Base URL:** `http://localhost:8000/api/index.php` (Development) or `https://api.echotrace.com` (Production)
- **Protocol:** HTTP/HTTPS
- **Data Format:** JSON
- **Authentication:** JWT Bearer Token in Authorization header
- **Rate Limiting:** 100 requests per minute per user
- **Response Format:** `{ "success": boolean, "data": object, "error": string }`

### Authentication Endpoints

**POST /auth/register**
- **Description:** Register new user account
- **Request Body:**
  ```json
  {
    "username": "string",
    "email": "string",
    "password": "string (min 8 chars)"
  }
  ```
- **Response:** `{ "success": true, "user_id": int, "token": "JWT" }`
- **Status Codes:** 201 (Created), 400 (Bad Request), 409 (Conflict)

**POST /auth/login**
- **Description:** Authenticate user and generate JWT token
- **Request Body:**
  ```json
  {
    "username_or_email": "string",
    "password": "string"
  }
  ```
- **Response:** `{ "success": true, "token": "JWT", "user": object }`
- **Status Codes:** 200 (OK), 401 (Unauthorized), 404 (Not Found)

**POST /auth/logout**
- **Description:** Invalidate user session
- **Authentication:** Required (JWT)
- **Response:** `{ "success": true, "message": "Logged out" }`
- **Status Codes:** 200 (OK), 401 (Unauthorized)

**POST /auth/refresh**
- **Description:** Refresh expired JWT token
- **Authentication:** Required (JWT)
- **Response:** `{ "success": true, "token": "JWT" }`
- **Status Codes:** 200 (OK), 401 (Unauthorized)

**POST /auth/change_password**
- **Description:** Change user password
- **Authentication:** Required (JWT)
- **Request Body:**
  ```json
  {
    "old_password": "string",
    "new_password": "string"
  }
  ```
- **Response:** `{ "success": true, "message": "Password changed" }`
- **Status Codes:** 200 (OK), 400 (Bad Request), 401 (Unauthorized)

### Product & Review Endpoints

**POST /products/extract**
- **Description:** Extract and store product information from URL
- **Authentication:** Required (JWT)
- **Request Body:**
  ```json
  {
    "url": "string",
    "platform": "string (amazon|shopee|lazada|ebay|aliexpress|walmart)"
  }
  ```
- **Response:** `{ "success": true, "product": object }`
- **Status Codes:** 200 (OK), 400 (Bad Request), 422 (Unprocessable Entity)

**GET /reviews/<product_id>**
- **Description:** Retrieve reviews for a specific product
- **Authentication:** Required (JWT)
- **Query Parameters:** `?page=int&limit=int&filter=string`
- **Response:** `{ "success": true, "reviews": array, "total": int }`
- **Status Codes:** 200 (OK), 404 (Not Found)

**POST /reviews/analyze**
- **Description:** Send reviews to AI service for analysis
- **Authentication:** Required (JWT)
- **Request Body:**
  ```json
  {
    "product_id": "int",
    "reviews": [
      {
        "id": "int",
        "text": "string",
        "rating": "int"
      }
    ]
  }
  ```
- **Response:** `{ "success": true, "analysis_results": array }`
- **Status Codes:** 200 (OK), 400 (Bad Request), 503 (Service Unavailable)

### Scan & Report Endpoints

**POST /scans/manual**
- **Description:** Initiate manual product scan
- **Authentication:** Required (JWT)
- **Request Body:**
  ```json
  {
    "product_url": "string",
    "platform": "string",
    "include_images": "boolean"
  }
  ```
- **Response:** `{ "success": true, "scan_id": int, "status": "processing" }`
- **Status Codes:** 202 (Accepted), 400 (Bad Request)

**GET /scans/<scan_id>**
- **Description:** Retrieve scan details and status
- **Authentication:** Required (JWT)
- **Response:** `{ "success": true, "scan": object, "status": "string" }`
- **Status Codes:** 200 (OK), 404 (Not Found)

**GET /scans/history**
- **Description:** Get user's scan history
- **Authentication:** Required (JWT)
- **Query Parameters:** `?page=int&limit=int&sort=string`
- **Response:** `{ "success": true, "scans": array, "total": int }`
- **Status Codes:** 200 (OK), 401 (Unauthorized)

**GET /reports/<scan_id>**
- **Description:** Retrieve detailed scan report
- **Authentication:** Required (JWT)
- **Response:** 
  ```json
  {
    "success": true,
    "report": {
      "product_id": "int",
      "trust_score": "float",
      "fake_count": "int",
      "genuine_count": "int",
      "strengths": "array",
      "weaknesses": "array",
      "recommendation": "string"
    }
  }
  ```
- **Status Codes:** 200 (OK), 404 (Not Found)

**POST /reports/<scan_id>/export**
- **Description:** Export report as PDF or CSV
- **Authentication:** Required (JWT)
- **Query Parameters:** `?format=string (pdf|csv)`
- **Response:** File download
- **Status Codes:** 200 (OK), 404 (Not Found), 400 (Bad Request)

### Community Feedback Endpoints

**POST /feedback**
- **Description:** Submit community feedback on review classification
- **Authentication:** Required (JWT)
- **Request Body:**
  ```json
  {
    "review_id": "int",
    "label": "string (fake|genuine)",
    "comments": "string",
    "confidence": "float"
  }
  ```
- **Response:** `{ "success": true, "feedback_id": int }`
- **Status Codes:** 201 (Created), 400 (Bad Request)

**GET /feedback/<review_id>**
- **Description:** Get feedback for a specific review
- **Query Parameters:** `?limit=int`
- **Response:** `{ "success": true, "feedback": array }`
- **Status Codes:** 200 (OK), 404 (Not Found)

### Admin Endpoints

**GET /admin/users**
- **Description:** List all users (Admin only)
- **Authentication:** Required (JWT + Admin role)
- **Query Parameters:** `?page=int&search=string&status=string&role=string`
- **Response:** `{ "success": true, "users": array, "total": int }`
- **Status Codes:** 200 (OK), 401 (Unauthorized), 403 (Forbidden)

**PUT /admin/users/<user_id>**
- **Description:** Update user information
- **Authentication:** Required (JWT + Admin role)
- **Request Body:** `{ "username": "string", "email": "string", "role": "string", "status": "string" }`
- **Response:** `{ "success": true, "message": "User updated" }`
- **Status Codes:** 200 (OK), 400 (Bad Request), 403 (Forbidden), 404 (Not Found)

**DELETE /admin/users/<user_id>**
- **Description:** Delete user account
- **Authentication:** Required (JWT + Admin role)
- **Response:** `{ "success": true, "message": "User deleted" }`
- **Status Codes:** 200 (OK), 403 (Forbidden), 404 (Not Found)

**GET /admin/settings**
- **Description:** Retrieve system settings
- **Authentication:** Required (JWT + Admin role)
- **Response:** `{ "success": true, "settings": object }`
- **Status Codes:** 200 (OK), 401 (Unauthorized), 403 (Forbidden)

**PUT /admin/settings**
- **Description:** Update system settings
- **Authentication:** Required (JWT + Admin role)
- **Request Body:** `{ "setting_key": "value" }`
- **Response:** `{ "success": true, "message": "Settings updated" }`
- **Status Codes:** 200 (OK), 400 (Bad Request), 403 (Forbidden)

**GET /admin/dashboard**
- **Description:** Get admin dashboard statistics
- **Authentication:** Required (JWT + Admin role)
- **Response:**
  ```json
  {
    "success": true,
    "dashboard": {
      "total_users": "int",
      "active_users": "int",
      "total_products": "int",
      "total_reviews": "int",
      "fake_reviews": "int",
      "ai_accuracy": "float"
    }
  }
  ```
- **Status Codes:** 200 (OK), 401 (Unauthorized), 403 (Forbidden)

**POST /admin/ai/retrain**
- **Description:** Trigger AI model retraining
- **Authentication:** Required (JWT + Admin role)
- **Request Body:** `{ "dataset_source": "string" }`
- **Response:** `{ "success": true, "job_id": int, "status": "starting" }`
- **Status Codes:** 202 (Accepted), 400 (Bad Request), 403 (Forbidden)

## Python AI Service API

The **Python AI microservice** provides **machine learning** and **natural language processing** capabilities to the **backend system**.

### AI Service Configuration
- **Service URL:** `http://localhost:5000` (Development)
- **Framework:** Flask with Flask-CORS
- **Port:** 5000
- **Communication:** JSON over HTTP
- **Processing:** Batch and real-time analysis

### AI Endpoints

**GET /health**
- **Description:** Check AI service health status
- **Response:** 
  ```json
  {
    "status": "healthy",
    "service": "EchoTrace AI Engine",
    "timestamp": "float",
    "model_version": "string"
  }
  ```
- **Status Codes:** 200 (OK), 503 (Service Unavailable)

**POST /analyze**
- **Description:** Analyze single review for fake/genuine classification
- **Request Body:**
  ```json
  {
    "review_text": "string",
    "rating": "int",
    "author": "string",
    "review_date": "string"
  }
  ```
- **Response:**
  ```json
  {
    "is_fake": "boolean",
    "confidence_score": "float (0-100)",
    "sentiment": "string (positive|negative|neutral)",
    "emotion": "string",
    "toxicity": "float (0-100)",
    "reasons": ["string"]
  }
  ```
- **Status Codes:** 200 (OK), 400 (Bad Request), 422 (Unprocessable Entity)

**POST /batch_analyze**
- **Description:** Analyze multiple reviews in batch
- **Request Body:**
  ```json
  {
    "reviews": [
      {
        "id": "int",
        "text": "string",
        "rating": "int"
      }
    ]
  }
  ```
- **Response:** `{ "results": array }`
- **Status Codes:** 200 (OK), 400 (Bad Request), 503 (Service Unavailable)

**POST /retrain**
- **Description:** Trigger model retraining with new data
- **Request Body:**
  ```json
  {
    "training_data": "array",
    "validation_split": "float",
    "epochs": "int"
  }
  ```
- **Response:** `{ "status": "training", "job_id": int, "eta_seconds": int }`
- **Status Codes:** 202 (Accepted), 400 (Bad Request)

**GET /model/status**
- **Description:** Get current model status and metrics
- **Response:**
  ```json
  {
    "model_version": "string",
    "accuracy": "float",
    "precision": "float",
    "recall": "float",
    "f1_score": "float",
    "last_trained": "string (ISO 8601)",
    "training_samples": "int"
  }
  ```
- **Status Codes:** 200 (OK), 503 (Service Unavailable)

---

# Hardware Interface

The **Hardware Interface** defines the **physical and computational requirements** necessary for the **EchoTrace system** to operate effectively.

## Development Environment Hardware

**Recommended Developer Workstation:**
- **CPU:** Intel i7/AMD Ryzen 5 or higher (Quad-core minimum)
- **RAM:** 16GB minimum (8GB functional minimum)
- **Storage:** 512GB SSD (250GB available space minimum)
- **Network:** Ethernet connection for stable testing
- **Display:** 1920x1080 or higher resolution monitor
- **Operating System:** Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)

## Production Server Hardware

**Recommended Production Server:**
- **CPU:** 8-core vCPU (AWS t3.2xlarge equivalent or higher)
- **RAM:** 32GB minimum (64GB for high-traffic scenarios)
- **Storage:** 1TB SSD (NVMe preferred) with automated expansion
- **Network:** Redundant 1Gbps uplink with load balancing
- **Backup:** Secondary storage with daily snapshots
- **Failover:** Standby server with automatic failover capability
- **Monitoring:** Real-time performance monitoring and alerting

## Database Server Hardware

**MySQL/MariaDB Server:**
- **CPU:** 4-core vCPU minimum for concurrent queries
- **RAM:** 16GB minimum for proper buffer pool allocation
- **Storage:** 500GB SSD for database files with 30% free space
- **RAID:** RAID 1 or RAID 10 for data protection
- **Backup:** Automated daily backups with weekly offsite replication

## AI/ML Service Hardware

**Python AI Service Requirements:**
- **CPU:** GPU acceleration recommended (NVIDIA CUDA capable)
- **RAM:** 8GB minimum for model loading and batch processing
- **Storage:** 50GB SSD for model files and training data
- **Processing Power:** Sufficient to handle 100+ concurrent analysis requests

## Network Requirements

- **Internet Speed:** Minimum 10 Mbps download, 5 Mbps upload
- **Latency:** <50ms average latency to client
- **Bandwidth:** Minimum 100 GB/month data allowance
- **SSL/TLS:** Support for HTTPS with valid certificates
- **Firewall:** Configured to allow necessary ports (80, 443, 3306, 5000)

---

# System Architecture Overview

The **EchoTrace system** employs a **layered microservices architecture** designed for **scalability**, **maintainability**, and **performance**.

## Architecture Layers

### 1. Presentation Layer (Frontend)

The **presentation layer** includes all **user-facing interfaces**:
- **Web Frontend (SPA):** Single-page application built with HTML5, CSS3, and Vanilla JavaScript
- **Chrome Extension:** Browser extension for in-page review analysis
- **Mobile-Responsive UI:** Adaptive design for tablets and mobile devices
- **Accessibility:** WCAG 2.1 Level AA compliance

### 2. API Gateway Layer

The **API Gateway** serves as the **single entry point** for all **client requests**:
- **Request Validation:** Input sanitization and format validation
- **Authentication:** JWT token verification
- **Authorization:** Role-based access control (RBAC)
- **Rate Limiting:** Request throttling per user/IP
- **CORS Management:** Cross-Origin Resource Sharing configuration
- **Request Logging:** Audit trail for all API requests

### 3. Business Logic Layer (Backend)

The **backend layer** contains the **core application logic**:
- **Authentication Service:** User login, registration, token management
- **Product Service:** Product data extraction and management
- **Scan Service:** Scan orchestration and result aggregation
- **Report Service:** Report generation and export
- **User Service:** User profile and preference management
- **Admin Service:** System monitoring and configuration
- **Notification Service:** User alerts and messaging

### 4. AI/ML Service Layer

The **AI service** provides **machine learning** capabilities:
- **Text Preprocessing:** Tokenization, lemmatization, cleaning
- **Feature Extraction:** TF-IDF vectorization
- **Classification:** Logistic Regression model for fake detection
- **Sentiment Analysis:** Positive/negative/neutral classification
- **Duplicate Detection:** Cosine similarity matching
- **Toxicity Detection:** Profanity and hate speech identification

### 5. Data Layer

The **data layer** manages all **persistent storage**:
- **Relational Database:** MySQL for structured data
- **Cache Layer:** Redis for session and frequent data caching
- **File Storage:** Server storage for reports and backups
- **Logging:** Centralized logging for debugging and monitoring

---

# Development Cycle & Process Flow

The **EchoTrace development cycle** follows the **Agile-Scrum methodology** with **continuous improvement** at every stage.

## Sprint Cycle (2-Week Iteration)

### Day 1-2: Sprint Planning & Kickoff

**Sprint Planning Meeting (4 hours):**
1. **Product Backlog Review:** Prioritize upcoming features and fixes
2. **User Story Selection:** Choose stories for the sprint backlog
3. **Effort Estimation:** Assign story points using planning poker
4. **Sprint Goal Definition:** Define measurable sprint objectives
5. **Task Breakdown:** Decompose user stories into technical tasks
6. **Resource Allocation:** Assign tasks to team members
7. **Risk Assessment:** Identify potential blockers

**Kickoff Activities:**
- Set up development branches in Git
- Update project management tool with assignments
- Prepare development environments
- Review acceptance criteria for each story

### Day 3-9: Development & Testing

**Daily Activities:**

**Daily Standup (15 minutes, 9:00 AM):**
- What did you accomplish yesterday?
- What will you accomplish today?
- Are there any blockers or risks?
- Do you need help from teammates?

**Coding Standards Enforcement:**
- Follow established naming conventions
- Write self-documenting code with meaningful comments
- Implement error handling and logging
- Write unit tests for new functions
- Maintain code coverage >80%

**Version Control Workflow:**
1. Create feature branch: `git checkout -b feature/feature-name`
2. Commit frequently: `git commit -m "Clear commit message"`
3. Push to remote: `git push origin feature/feature-name`
4. Create Pull Request (PR) for code review
5. Address reviewer feedback
6. Merge to develop branch after approval
7. Delete feature branch

**Code Review Process:**
- Minimum 2 reviewers for critical code
- Check for security vulnerabilities
- Verify test coverage
- Validate adherence to coding standards
- Review for performance implications
- Provide constructive feedback

**Testing During Development:**

**Unit Testing:**
- Test individual functions and methods
- Verify algorithm correctness
- Test edge cases and error conditions
- Maintain >80% code coverage

**Integration Testing:**
- Test module interactions
- Verify API endpoint functionality
- Test database transactions
- Test with external services

**Manual Testing:**
- Test complete workflows
- Verify UI responsiveness
- Test cross-browser compatibility
- Test on different screen sizes

### Day 10: Code Freeze & QA Testing

**Code Freeze Activities:**
- No new feature development
- Bug fixes and security patches only
- Prepare release branches
- Update documentation
- Version bump and changelog

**Comprehensive QA Testing:**

**Functional Testing:**
- Execute all test cases
- Verify feature completeness
- Test user workflows end-to-end
- Validate report accuracy
- Test Chrome extension functionality

**Regression Testing:**
- Run full test suite
- Verify no new bugs introduced
- Test backward compatibility
- Test database migrations

**Security Testing:**
- Run OWASP security scanner
- Test authentication mechanisms
- Verify authorization controls
- Test for SQL injection vulnerabilities
- Test for XSS vulnerabilities
- Validate CSRF protection

**Performance Testing:**
- Load test with concurrent users
- Measure API response times
- Monitor database query performance
- Check memory and CPU usage
- Identify bottlenecks

**Issue Tracking & Resolution:**

**Critical Issues (Fix immediately):**
- Security vulnerabilities
- Functionality breaking bugs
- Data loss risks
- System crashes

**High Priority Issues (Fix before release):**
- Feature not working as expected
- Performance problems
- Accessibility issues
- UI/UX problems

**Medium Priority Issues (Fix next sprint):**
- Minor UI bugs
- Cosmetic improvements
- Performance optimizations
- Documentation updates

**Low Priority Issues (Future sprints):**
- Nice-to-have features
- Code refactoring
- Technical debt
- Enhancement requests

### Day 11-12: Sprint Review & Retrospective

**Sprint Review Meeting (2 hours):**
1. **Demo Completed Work:** Show functioning features to stakeholders
2. **Accept/Reject Stories:** Verify acceptance criteria met
3. **Gather Feedback:** Collect stakeholder input and suggestions
4. **Update Product Backlog:** Incorporate new requirements
5. **Q&A Session:** Answer questions about implemented features

**Sprint Retrospective Meeting (1.5 hours):**
1. **What Went Well:** Celebrate successes and acknowledge good practices
2. **What Could Be Improved:** Identify process bottlenecks
3. **What Will We Try:** Action items for next sprint
4. **Metrics Review:** Velocity, burn-down chart, defect rate
5. **Team Discussion:** Anonymous feedback if needed
6. **Action Items:** Assign owners to improvement initiatives

**Release Preparation:**
- Generate release notes
- Create tagged versions in Git
- Deploy to staging environment
- Conduct smoke testing
- Prepare deployment documentation
- Brief operations team on deployment

---

## Quality Assurance Cycle

### Pre-Release QA Checklist

**Code Quality:**
- ✓ All code follows style guide
- ✓ Code documentation complete
- ✓ No commented-out code
- ✓ No debug statements in production code
- ✓ Error handling implemented
- ✓ Logging comprehensive

**Testing:**
- ✓ Unit test coverage >80%
- ✓ Integration tests passing
- ✓ Regression tests passing
- ✓ Performance tests acceptable
- ✓ Security tests passing
- ✓ Cross-browser tests passing
- ✓ Mobile responsiveness verified

**Documentation:**
- ✓ User guide updated
- ✓ API documentation current
- ✓ Installation guide prepared
- ✓ Known issues documented
- ✓ Release notes written
- ✓ Database migration scripts prepared

**Security:**
- ✓ No hardcoded credentials
- ✓ Dependencies up-to-date
- ✓ Security headers configured
- ✓ HTTPS certificate valid
- ✓ Backups tested and verified
- ✓ Access controls verified

---

## Continuous Improvement Process

**Post-Release Monitoring:**
- Monitor error logs in real-time
- Track user feedback and bug reports
- Measure system performance metrics
- Analyze user behavior and feature usage
- Calculate AI detection accuracy

**Feedback Integration:**
- Create issues from bug reports
- Prioritize based on impact and frequency
- Assign to backlog for next sprint
- Communicate fixes to users
- Track time-to-resolution metrics

**Performance Optimization:**
- Identify slow API endpoints
- Optimize database queries
- Implement caching strategies
- Reduce frontend load time
- Improve AI processing speed

**Knowledge Management:**
- Document lessons learned
- Update internal wikis
- Share best practices
- Conduct knowledge transfer sessions
- Maintain runbooks for operations


---

# Database Schema & Design

The **database schema** of the **EchoTrace system** is designed using **normalized relational database principles** to ensure **data consistency**, **referential integrity**, and **optimal query performance**. The schema consists of **12 main tables** with carefully defined **relationships**, **constraints**, and **indexes**.

## Database Overview

**Database Management System:** MySQL 5.7+ or MariaDB 10.3+
**Character Set:** UTF-8MB4 for full Unicode support
**Collation:** utf8mb4_unicode_ci
**Storage Engine:** InnoDB for ACID compliance and foreign key support

---

## Table Definitions

### 1. Users Table

The **users table** stores **user account information** and **authentication credentials**.

```sql
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('user', 'admin') DEFAULT 'user',
  `status` ENUM('active', 'blocked') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_username` (`username`),
  INDEX `idx_role` (`role`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 8
- **Primary Key:** `id` (Auto-increment integer)
- **Unique Constraints:** `username`, `email`
- **Indexes:** 5 (for fast lookups)
- **Purpose:** Stores user account and authentication information

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique user identifier |
| `username` | VARCHAR(50) | NOT NULL, UNIQUE | User login name (3-50 chars) |
| `email` | VARCHAR(100) | NOT NULL, UNIQUE | User email address |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt hashed password |
| `role` | ENUM | DEFAULT 'user' | User role (user or admin) |
| `status` | ENUM | DEFAULT 'active' | Account status (active/blocked) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Account creation timestamp |
| `updated_at` | TIMESTAMP | ON UPDATE | Last update timestamp |

**Indexes:** Created on `email`, `username`, `role`, and `status` for optimized searching and filtering.

---

### 2. Products Table

The **products table** stores **e-commerce product information** extracted from various platforms.

```sql
CREATE TABLE `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `platform` VARCHAR(50) NOT NULL,
  `external_id` VARCHAR(100) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `url` TEXT NOT NULL,
  `image_url` TEXT NULL,
  `rating` DECIMAL(3,2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uc_platform_external_id` (`platform`, `external_id`),
  INDEX `idx_platform` (`platform`),
  INDEX `idx_rating` (`rating`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 9
- **Primary Key:** `id`
- **Unique Composite Key:** (`platform`, `external_id`)
- **Purpose:** Stores product metadata from e-commerce platforms

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Product unique identifier |
| `platform` | VARCHAR(50) | NOT NULL | E-commerce platform (amazon, shopee, etc.) |
| `external_id` | VARCHAR(100) | NOT NULL | Platform-specific product ID (ASIN, item ID) |
| `title` | VARCHAR(255) | NOT NULL | Product name/title |
| `url` | TEXT | NOT NULL | Product page URL |
| `image_url` | TEXT | NULL | Product image URL |
| `rating` | DECIMAL(3,2) | DEFAULT 0.00 | Average rating (0.00-5.00) |
| `created_at` | TIMESTAMP | DEFAULT | Record creation timestamp |
| `updated_at` | TIMESTAMP | ON UPDATE | Last update timestamp |

**Indexes:** Created on `platform`, `rating`, and `created_at` for efficient querying.

---

### 3. Reviews Table

The **reviews table** stores **individual product reviews** extracted from products.

```sql
CREATE TABLE `reviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `author` VARCHAR(100) DEFAULT 'Anonymous',
  `rating` INT DEFAULT 5,
  `review_text` LONGTEXT NOT NULL,
  `title` VARCHAR(255) DEFAULT '',
  `review_date` VARCHAR(100) DEFAULT NULL,
  `external_review_id` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX `idx_product_id` (`product_id`),
  INDEX `idx_rating` (`rating`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 9
- **Primary Key:** `id`
- **Foreign Key:** `product_id` (References `products.id`)
- **Purpose:** Stores individual reviews for each product

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Review unique identifier |
| `product_id` | INT | NOT NULL, FK | Reference to parent product |
| `author` | VARCHAR(100) | DEFAULT 'Anonymous' | Reviewer name/username |
| `rating` | INT | DEFAULT 5 | Review rating (1-5 stars) |
| `review_text` | LONGTEXT | NOT NULL | Full review text content |
| `title` | VARCHAR(255) | DEFAULT '' | Review title/headline |
| `review_date` | VARCHAR(100) | NULL | Date review was published |
| `external_review_id` | VARCHAR(100) | NULL | Platform's unique review ID |
| `created_at` | TIMESTAMP | DEFAULT | Database record creation time |

**Cascading Deletes:** If a product is deleted, all its reviews are automatically deleted.

---

### 4. Review Analysis Table

The **review_analysis table** stores **AI/ML analysis results** for each review.

```sql
CREATE TABLE `review_analysis` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `review_id` INT NOT NULL,
  `is_fake` TINYINT(1) DEFAULT 0,
  `confidence_score` DECIMAL(5,2) DEFAULT 0.00,
  `sentiment` VARCHAR(20) DEFAULT 'neutral',
  `emotion` VARCHAR(50) DEFAULT NULL,
  `toxicity` DECIMAL(5,2) DEFAULT 0.00,
  `duplicate_group_id` INT DEFAULT NULL,
  `keywords` TEXT DEFAULT NULL,
  `intent` VARCHAR(50) DEFAULT 'Feedback',
  `grammar_score` DECIMAL(5,2) DEFAULT 100.00,
  `classification` VARCHAR(50) DEFAULT 'Genuine Review',
  `risk_level` VARCHAR(20) DEFAULT 'Low Risk',
  `fake_reasons` JSON DEFAULT NULL,
  `checked_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uc_review_id` (`review_id`),
  INDEX `idx_is_fake` (`is_fake`),
  INDEX `idx_confidence` (`confidence_score`),
  INDEX `idx_sentiment` (`sentiment`),
  INDEX `idx_checked_at` (`checked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 15
- **Primary Key:** `id`
- **Foreign Key:** `review_id` (References `reviews.id`)
- **Purpose:** Stores AI analysis results and predictions

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Analysis record identifier |
| `review_id` | INT | NOT NULL, FK | Reference to reviewed review |
| `is_fake` | TINYINT(1) | DEFAULT 0 | Binary classification (1=fake, 0=genuine) |
| `confidence_score` | DECIMAL(5,2) | DEFAULT 0.00 | ML confidence (0.00-100.00%) |
| `sentiment` | VARCHAR(20) | DEFAULT | Sentiment (positive/negative/neutral) |
| `emotion` | VARCHAR(50) | NULL | Detected emotion (anger, joy, fear, etc.) |
| `toxicity` | DECIMAL(5,2) | DEFAULT 0.00 | Toxicity percentage (0.00-100.00%) |
| `duplicate_group_id` | INT | NULL | Groups duplicate reviews |
| `keywords` | TEXT | NULL | JSON array of extracted keywords |
| `intent` | VARCHAR(50) | DEFAULT | Intent classification (Feedback, Complaint, Praise) |
| `grammar_score` | DECIMAL(5,2) | DEFAULT 100.00 | Grammar quality score |
| `classification` | VARCHAR(50) | DEFAULT | Classification label |
| `risk_level` | VARCHAR(20) | DEFAULT | Risk level (Low/Medium/High) |
| `fake_reasons` | JSON | NULL | JSON array of classification reasons |
| `checked_at` | TIMESTAMP | DEFAULT | When analysis was performed |

**Key Features:**
- **Binary Classification:** `is_fake` indicates fake (1) or genuine (0) review
- **Confidence Metrics:** Multiple scoring systems for comprehensive analysis
- **Reason Storage:** JSON format allows flexible reason storage
- **Duplicate Detection:** `duplicate_group_id` groups similar reviews

---

### 5. Scan History Table

The **scan_history table** tracks **user scan requests** and **aggregated results**.

```sql
CREATE TABLE `scan_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `product_id` INT NOT NULL,
  `trust_score` DECIMAL(5,2) NOT NULL,
  `fake_count` INT DEFAULT 0,
  `genuine_count` INT DEFAULT 0,
  `risk_level` VARCHAR(20) DEFAULT 'Low Risk',
  `scan_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_product_id` (`product_id`),
  INDEX `idx_trust_score` (`trust_score`),
  INDEX `idx_scan_date` (`scan_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 8
- **Primary Key:** `id`
- **Foreign Keys:** `user_id`, `product_id`
- **Purpose:** Records each product scan and aggregated results

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Scan record identifier |
| `user_id` | INT | NULL, FK | User who performed scan (NULL for anonymous) |
| `product_id` | INT | NOT NULL, FK | Product that was scanned |
| `trust_score` | DECIMAL(5,2) | NOT NULL | Overall trust score (0.00-100.00) |
| `fake_count` | INT | DEFAULT 0 | Number of detected fake reviews |
| `genuine_count` | INT | DEFAULT 0 | Number of genuine reviews |
| `risk_level` | VARCHAR(20) | DEFAULT | Overall risk level (Low/Medium/High) |
| `scan_date` | TIMESTAMP | DEFAULT | When scan was performed |

**Analysis Aggregation:**
- `trust_score = (genuine_count / (fake_count + genuine_count)) * 100`
- Risk level calculated based on fake review percentage

---

### 6. Reports Table

The **reports table** stores **generated analysis reports** for scans.

```sql
CREATE TABLE `reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `scan_history_id` INT NOT NULL,
  `summary_strengths` JSON DEFAULT NULL,
  `summary_weaknesses` JSON DEFAULT NULL,
  `summary_recommendation` TEXT DEFAULT NULL,
  `overall_quality` VARCHAR(50) DEFAULT NULL,
  `genuine_summary` TEXT DEFAULT NULL,
  `generated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`scan_history_id`) REFERENCES `scan_history`(`id`) ON DELETE CASCADE,
  INDEX `idx_product_id` (`product_id`),
  INDEX `idx_scan_history_id` (`scan_history_id`),
  INDEX `idx_generated_at` (`generated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 9
- **Primary Key:** `id`
- **Foreign Keys:** `product_id`, `scan_history_id`
- **Purpose:** Stores generated analysis reports

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Report identifier |
| `product_id` | INT | NOT NULL, FK | Product being reported |
| `scan_history_id` | INT | NOT NULL, FK | Associated scan record |
| `summary_strengths` | JSON | NULL | JSON array of product strengths |
| `summary_weaknesses` | JSON | NULL | JSON array of product weaknesses |
| `summary_recommendation` | TEXT | NULL | Purchase recommendation text |
| `overall_quality` | VARCHAR(50) | NULL | Quality assessment (Excellent/Good/Fair/Poor) |
| `genuine_summary` | TEXT | NULL | Summary based on genuine reviews |
| `generated_at` | TIMESTAMP | DEFAULT | Report generation timestamp |

**JSON Structure Examples:**
```json
// strengths example
["Excellent quality", "Fast delivery", "Good customer service"]

// weaknesses example
["Some durability issues", "Packaging could be better"]
```

---

### 7. Notifications Table

The **notifications table** stores **user alerts and messages**.

```sql
CREATE TABLE `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_is_read` (`is_read`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 5
- **Primary Key:** `id`
- **Foreign Key:** `user_id`
- **Purpose:** Stores user notifications

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Notification identifier |
| `user_id` | INT | NOT NULL, FK | User receiving notification |
| `message` | VARCHAR(255) | NOT NULL | Notification message text |
| `is_read` | TINYINT(1) | DEFAULT 0 | Read status (1=read, 0=unread) |
| `created_at` | TIMESTAMP | DEFAULT | Notification creation time |

---

### 8. Feedback Table

The **feedback table** stores **community-submitted corrections** and ratings.

```sql
CREATE TABLE `feedback` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `review_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `reported_label` ENUM('fake', 'genuine') NOT NULL,
  `comments` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_review_id` (`review_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_reported_label` (`reported_label`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 6
- **Primary Key:** `id`
- **Foreign Keys:** `review_id`, `user_id`
- **Purpose:** Stores community feedback on review classifications

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Feedback identifier |
| `review_id` | INT | NOT NULL, FK | Review being reported |
| `user_id` | INT | NOT NULL, FK | User submitting feedback |
| `reported_label` | ENUM | NOT NULL | Reported classification (fake/genuine) |
| `comments` | TEXT | NULL | Additional comments from user |
| `created_at` | TIMESTAMP | DEFAULT | Feedback submission time |

---

### 9. AI Logs Table

The **ai_logs table** records **AI service requests and responses** for monitoring.

```sql
CREATE TABLE `ai_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `api_endpoint` VARCHAR(100) NOT NULL,
  `request_payload` LONGTEXT NULL,
  `response_payload` LONGTEXT NULL,
  `duration_ms` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_api_endpoint` (`api_endpoint`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_duration_ms` (`duration_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 6
- **Primary Key:** `id`
- **Purpose:** Logs all AI service interactions for debugging and performance monitoring

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Log entry identifier |
| `api_endpoint` | VARCHAR(100) | NOT NULL | AI endpoint called (/analyze, /batch_analyze) |
| `request_payload` | LONGTEXT | NULL | Request data sent to AI service |
| `response_payload` | LONGTEXT | NULL | Response received from AI service |
| `duration_ms` | INT | DEFAULT 0 | Processing time in milliseconds |
| `created_at` | TIMESTAMP | DEFAULT | Log entry creation time |

---

### 10. Settings Table

The **settings table** stores **system configuration parameters**.

```sql
CREATE TABLE `settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `setting_key` VARCHAR(50) NOT NULL UNIQUE,
  `setting_value` TEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_setting_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 4
- **Primary Key:** `id`
- **Unique Constraint:** `setting_key`
- **Purpose:** Key-value store for system configuration

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Setting identifier |
| `setting_key` | VARCHAR(50) | UNIQUE | Configuration parameter name |
| `setting_value` | TEXT | NOT NULL | Configuration parameter value |
| `updated_at` | TIMESTAMP | ON UPDATE | Last modification timestamp |

**Default Settings:**
```sql
INSERT INTO settings VALUES
('ai_detection_threshold', '0.65'),
('duplicate_similarity_threshold', '0.85'),
('max_reviews_per_scan', '100'),
('system_name', 'EchoTrace Fake Review Detector');
```

---

### 11. Login Logs Table

The **login_logs table** records **authentication attempts** for security audit.

```sql
CREATE TABLE `login_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `status` ENUM('success', 'failed') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_ip_address` (`ip_address`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 6
- **Primary Key:** `id`
- **Foreign Key:** `user_id` (nullable for failed login attempts)
- **Purpose:** Audit trail for authentication events

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Log entry identifier |
| `user_id` | INT | NULL, FK | User attempting to login |
| `ip_address` | VARCHAR(45) | NULL | Client IP address (IPv4/IPv6) |
| `user_agent` | TEXT | NULL | Browser user agent string |
| `status` | ENUM | NOT NULL | Login result (success/failed) |
| `created_at` | TIMESTAMP | DEFAULT | Login attempt timestamp |

---

### 12. Support Messages Table

The **support_messages table** stores **user contact form submissions**.

```sql
CREATE TABLE `support_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `subject` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Table Description:**
- **Columns:** 6
- **Primary Key:** `id`
- **Purpose:** Stores user support/feedback messages

**Column Descriptions:**
| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `id` | INT | PRIMARY KEY | Message identifier |
| `name` | VARCHAR(100) | NOT NULL | Submitter name |
| `email` | VARCHAR(100) | NOT NULL | Submitter email address |
| `subject` | VARCHAR(150) | NOT NULL | Message subject line |
| `message` | TEXT | NOT NULL | Message content |
| `created_at` | TIMESTAMP | DEFAULT | Submission timestamp |

---

## Entity-Relationship Diagram (ERD)

```
┌──────────────┐
│    USERS     │
├──────────────┤
│ id (PK)      │
│ username     │
│ email        │
│ password_hash│
│ role         │
│ status       │
│ created_at   │
│ updated_at   │
└────┬─────────┘
     │ (1)
     │ (M)
     ├────────────────────────────────────┐
     │                                    │
     ▼                                    ▼
┌──────────────┐                 ┌─────────────────┐
│ SCAN_HISTORY │                 │   FEEDBACK      │
├──────────────┤                 ├─────────────────┤
│ id (PK)      │                 │ id (PK)         │
│ user_id (FK) │                 │ review_id (FK)  │
│ product_id..├────────┐         │ user_id (FK)    │
│ trust_score  │        │         │ reported_label  │
│ fake_count   │        │         │ comments        │
│ genuine_count│        │         │ created_at      │
│ risk_level   │        │         └─────────────────┘
│ scan_date    │        │
└──────────────┘        │         ┌────────────────┐
                        │         │   REPORTS      │
                        │         ├────────────────┤
                        │         │ id (PK)        │
                        │         │ product_id (FK)│
                        │         │ scan_history..├─┐
                        │         │ summary_...    │ │
                        │         │ generated_at   │ │
                        │         └────────────────┘ │
                        │                           │
                        └──────────┬────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼ (1)                    ▼ (M)
            ┌──────────────┐        ┌──────────────┐
            │   PRODUCTS   │        │   REVIEWS    │
            ├──────────────┤        ├──────────────┤
            │ id (PK)      │        │ id (PK)      │
            │ platform     │        │ product_id..├─┐
            │ external_id  │        │ author       │ │
            │ title        │        │ rating       │ │
            │ url          │        │ review_text  │ │
            │ image_url    │        │ title        │ │
            │ rating       │        │ review_date  │ │
            │ created_at   │        │ external_id  │ │
            │ updated_at   │        │ created_at   │ │
            └──────────────┘        └──────────────┘
                                            │
                                            ▼ (1:1)
                                    ┌──────────────────┐
                                    │ REVIEW_ANALYSIS  │
                                    ├──────────────────┤
                                    │ id (PK)          │
                                    │ review_id (FK)   │
                                    │ is_fake          │
                                    │ confidence_score │
                                    │ sentiment        │
                                    │ emotion          │
                                    │ toxicity         │
                                    │ duplicate_group  │
                                    │ keywords         │
                                    │ intent           │
                                    │ grammar_score    │
                                    │ classification   │
                                    │ risk_level       │
                                    │ fake_reasons     │
                                    │ checked_at       │
                                    └──────────────────┘
```

---

## Database Indexes Strategy

**Indexes** are created to **optimize query performance** and **reduce database load**.

### Index Types & Coverage

**Primary Key Indexes:**
- `users.id` - Fastest access to user records
- `products.id` - Fastest access to product records
- `reviews.id` - Fastest access to review records
- `review_analysis.id` - Fastest access to analysis records

**Foreign Key Indexes:**
- `reviews.product_id` - Join optimization for product-review queries
- `review_analysis.review_id` - Join optimization for review-analysis queries
- `scan_history.user_id` - Filter scans by user
- `scan_history.product_id` - Filter scans by product
- `feedback.review_id` - Get feedback for reviews
- `feedback.user_id` - Get feedback submitted by user

**Search Indexes:**
- `users.email` - Fast user lookup by email
- `users.username` - Fast user lookup by username
- `products.platform` - Filter products by platform
- `reviews.rating` - Filter by review rating
- `review_analysis.is_fake` - Filter by classification
- `review_analysis.confidence_score` - Range queries on confidence

**Aggregation Indexes:**
- `scan_history.trust_score` - Sorting and filtering results
- `review_analysis.sentiment` - Sentiment distribution queries
- `login_logs.status` - Count success/failed logins
- `feedback.reported_label` - Count community corrections

**Time-Series Indexes:**
- `scan_history.scan_date` - Time-range queries
- `review_analysis.checked_at` - Recent analysis queries
- `login_logs.created_at` - Recent login attempts
- `support_messages.created_at` - Recent support messages

---

## Query Optimization Patterns

### Common Queries & Optimization

**Query 1: Get User Scan History**
```sql
SELECT s.id, s.product_id, p.title, s.trust_score, s.fake_count, 
       s.genuine_count, s.scan_date
FROM scan_history s
JOIN products p ON s.product_id = p.id
WHERE s.user_id = ? AND s.scan_date > DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY s.scan_date DESC
LIMIT 10;
```
**Optimization:** Uses indexes on `scan_history.user_id` and `scan_history.scan_date`

**Query 2: Get Product Reviews with Analysis**
```sql
SELECT r.id, r.review_text, r.rating, ra.is_fake, ra.confidence_score, 
       ra.sentiment, ra.fake_reasons
FROM reviews r
LEFT JOIN review_analysis ra ON r.id = ra.review_id
WHERE r.product_id = ? AND ra.checked_at IS NOT NULL
ORDER BY ra.is_fake DESC, ra.confidence_score DESC;
```
**Optimization:** Uses index on `reviews.product_id` and leverages 1:1 relationship

**Query 3: Get System Statistics**
```sql
SELECT 
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM products) as total_products,
  (SELECT COUNT(*) FROM reviews) as total_reviews,
  (SELECT COUNT(*) FROM review_analysis WHERE is_fake = 1) as fake_reviews,
  (SELECT AVG(trust_score) FROM scan_history) as avg_trust_score;
```
**Optimization:** Indexes on `users.id`, `products.id`, `reviews.id` enable fast counting

**Query 4: Find Duplicate Reviews**
```sql
SELECT ra.duplicate_group_id, COUNT(*) as count, 
       GROUP_CONCAT(r.id) as review_ids
FROM review_analysis ra
JOIN reviews r ON ra.review_id = r.id
WHERE ra.duplicate_group_id IS NOT NULL
GROUP BY ra.duplicate_group_id
HAVING count > 1;
```
**Optimization:** Index on `review_analysis.duplicate_group_id`

---

## Data Integrity & Constraints

### Foreign Key Relationships

**Cascade Deletes:**
- When product deleted → all associated reviews deleted
- When product deleted → all scan history deleted
- When review deleted → all feedback deleted
- When user deleted → all scan history becomes user_id = NULL

**Set Null on Delete:**
- When user deleted → scan_history.user_id = NULL (preserves scan history)
- When user deleted → login_logs.user_id = NULL (preserves audit trail)

### Unique Constraints

**Prevents Duplicates:**
- `users.username` - One username per system
- `users.email` - One email per user
- `products` (`platform`, `external_id`) - One product per platform
- `review_analysis.review_id` - One analysis per review
- `settings.setting_key` - One value per setting

### Check Constraints (Business Logic)

```sql
-- Rating range check
ALTER TABLE reviews ADD CHECK (rating >= 1 AND rating <= 5);

-- Confidence score range
ALTER TABLE review_analysis ADD CHECK (confidence_score >= 0 AND confidence_score <= 100);

-- Toxicity range
ALTER TABLE review_analysis ADD CHECK (toxicity >= 0 AND toxicity <= 100);

-- Trust score range
ALTER TABLE scan_history ADD CHECK (trust_score >= 0 AND trust_score <= 100);
```

---

## Backup & Recovery Strategy

**Automated Backup Schedule:**
- **Daily Full Backup:** 2:00 AM UTC
- **Hourly Incremental:** Every hour except backup hour
- **Weekly Archive:** Every Sunday 3:00 AM UTC
- **Retention:** Daily (7 days), Weekly (12 weeks), Monthly (12 months)

**Backup Destinations:**
- Primary: Local SSD storage
- Secondary: Cloud storage (AWS S3/Azure Blob)
- Tertiary: Encrypted offsite replication

**Recovery Procedures:**
- Time-to-recover (RTO): <15 minutes for full database
- Recovery point objective (RPO): <1 hour
- Testing: Monthly recovery drills to verify backup integrity

---

## Summary of Database Schema

The **EchoTrace database schema** provides:
- **12 optimized tables** with proper normalization
- **Referential integrity** through foreign keys
- **Query optimization** through strategic indexing
- **Data security** through constraints and audit logging
- **Scalability** to handle millions of reviews
- **Flexibility** for future enhancements and feature additions

All tables use **UTF-8MB4 character encoding** for full Unicode support and **InnoDB storage engine** for **ACID compliance**, ensuring **data consistency** and **reliability** for the **EchoTrace system**.
