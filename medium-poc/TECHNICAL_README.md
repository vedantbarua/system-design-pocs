# Technical README: Medium POC

This document provides a detailed technical explanation of the Medium-like blogging platform POC, including every file, its purpose, and the underlying logic and architecture.

## Architecture Overview

The application follows the **Model-View-Controller (MVC)** pattern using Spring Boot:

- **Model**: `Article` entity and `ArticleRepository` for data persistence
- **View**: Thymeleaf templates for rendering HTML
- **Controller**: `ArticleController` handles HTTP requests and responses

**Technology Stack**:
- **Spring Boot**: Framework for building the web application
- **Spring Data JPA**: ORM for database interactions
- **H2 Database**: In-memory database for POC (data persists only during runtime)
- **Thymeleaf**: Server-side templating engine
- **Bootstrap**: CSS framework for responsive UI

**Application Flow**:
1. User accesses `/` → Controller fetches articles from DB → Renders home.html
2. User clicks article link → Controller fetches specific article → Renders article.html
3. User clicks "Write New Article" → Controller shows form → User submits → Saves to DB → Redirects to home

## File Structure

```
medium-poc/
├── pom.xml                           # Maven project configuration
├── src/main/resources/
│   ├── application.properties        # Application configuration
│   ├── templates/                    # Thymeleaf view templates
│   │   ├── home.html                 # Home page template
│   │   ├── article.html              # Article view template
│   │   └── new-article.html          # New article form template
│   └── static/                       # Static resources (CSS/JS/images)
├── src/main/java/com/example/mediumpoc/
│   ├── MediumPocApplication.java     # Main application class
│   ├── Article.java                  # JPA entity
│   ├── ArticleRepository.java        # Data access layer
│   └── ArticleController.java        # Web controller
└── README.md                         # Brief overview
```

## Detailed File Explanations

### pom.xml

**Purpose**: Maven Project Object Model (POM) file that defines the project configuration, dependencies, and build plugins.

**Key Sections**:
- **Parent**: Inherits from `spring-boot-starter-parent` (version 3.2.0), which provides default configurations for Spring Boot projects.
- **Properties**: Sets Java version to 17.
- **Dependencies**:
  - `spring-boot-starter-web`: Includes Spring MVC, Tomcat embedded server, and Jackson for JSON.
  - `spring-boot-starter-thymeleaf`: Enables Thymeleaf templating engine.
  - `spring-boot-starter-data-jpa`: Provides Spring Data JPA for database operations.
  - `h2`: In-memory database for development/testing.
  - `spring-boot-starter-test`: Testing framework (not used in POC).
- **Build Plugins**: `spring-boot-maven-plugin` for packaging and running the application.

**Logic**: Maven uses this file to download dependencies from Maven Central and build the project. The parent POM ensures consistent versions across Spring ecosystem.

### src/main/resources/application.properties

**Purpose**: Configuration file for Spring Boot application properties.

**Key Properties**:
- **Database Configuration**:
  - `spring.datasource.url=jdbc:h2:mem:testdb`: Connects to in-memory H2 database named "testdb".
  - `spring.datasource.driverClassName=org.h2.Driver`: Specifies H2 JDBC driver.
  - `spring.datasource.username=sa` & `password=password`: Default H2 credentials.
  - `spring.jpa.database-platform=org.hibernate.dialect.H2Dialect`: Hibernate dialect for H2.
  - `spring.h2.console.enabled=true`: Enables H2 web console at `/h2-console`.
- **JPA Configuration**:
  - `spring.jpa.hibernate.ddl-auto=create-drop`: Creates tables on startup, drops on shutdown (suitable for POC).
- **Thymeleaf Configuration**:
  - `spring.thymeleaf.cache=false`: Disables template caching for development (templates reload on changes).

**Logic**: These properties configure the embedded H2 database and disable caching for easier development. In production, you'd use a persistent database and enable caching.

### src/main/java/com/example/mediumpoc/MediumPocApplication.java

**Purpose**: Main application class that bootstraps the Spring Boot application.

**Code**:
```java
@SpringBootApplication
public class MediumPocApplication {
    public static void main(String[] args) {
        SpringApplication.run(MediumPocApplication.class, args);
    }
}
```

**Annotations**:
- `@SpringBootApplication`: Combines `@Configuration`, `@EnableAutoConfiguration`, and `@ComponentScan`. Enables component scanning, auto-configuration, and marks this as the main configuration class.

**Logic**: When run, Spring Boot:
1. Scans for components in the package and subpackages.
2. Auto-configures based on dependencies (e.g., sets up Tomcat, JPA, Thymeleaf).
3. Starts the embedded web server on port 8080.
4. Initializes the application context with all beans.

### src/main/java/com/example/mediumpoc/Article.java

**Purpose**: JPA entity representing an article in the database.

**Code**:
```java
@Entity
public class Article {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;
    private String title, content, author;
    // Constructors, getters, setters
}
```

**Annotations**:
- `@Entity`: Marks this class as a JPA entity, mapped to a database table named "article".
- `@Id`: Primary key field.
- `@GeneratedValue(strategy = GenerationType.AUTO)`: Auto-generates ID values.

**Logic**: JPA maps this class to a database table. Fields become columns. The entity represents the data model for articles, with basic CRUD operations handled by the repository.

### src/main/java/com/example/mediumpoc/ArticleRepository.java

**Purpose**: Data Access Object (DAO) for Article entities using Spring Data JPA.

**Code**:
```java
public interface ArticleRepository extends JpaRepository<Article, Long> {}
```

**Inheritance**:
- `JpaRepository<Article, Long>`: Provides CRUD operations for Article entities with Long IDs.

**Logic**: Spring Data JPA generates implementations at runtime. Methods like `findAll()`, `findById()`, `save()` are automatically available. This follows the Repository pattern for data access abstraction.

### src/main/java/com/example/mediumpoc/ArticleController.java

**Purpose**: Spring MVC controller handling HTTP requests and responses.

**Code**:
```java
@Controller
public class ArticleController {
    @Autowired private ArticleRepository articleRepository;

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("articles", articleRepository.findAll());
        return "home";
    }

    @GetMapping("/article/{id}")
    public String viewArticle(@PathVariable Long id, Model model) {
        Article article = articleRepository.findById(id).orElse(null);
        model.addAttribute("article", article);
        return "article";
    }

    @GetMapping("/new")
    public String newArticleForm(Model model) {
        model.addAttribute("article", new Article());
        return "new-article";
    }

    @PostMapping("/new")
    public String saveArticle(@ModelAttribute Article article) {
        articleRepository.save(article);
        return "redirect:/";
    }
}
```

**Annotations**:
- `@Controller`: Marks as MVC controller, methods return view names.
- `@Autowired`: Injects ArticleRepository bean.
- `@GetMapping`/`@PostMapping`: Map HTTP requests to methods.
- `@PathVariable`: Extracts path variables.
- `@ModelAttribute`: Binds form data to Article object.

**Logic**:
- **home()**: Fetches all articles, adds to model, returns "home" (renders home.html).
- **viewArticle()**: Fetches article by ID, adds to model, returns "article".
- **newArticleForm()**: Creates empty Article, returns "new-article".
- **saveArticle()**: Saves submitted article, redirects to home.

This implements the Controller layer, handling requests and preparing data for views.

### src/main/resources/templates/home.html

**Purpose**: Thymeleaf template for the home page displaying article list.

**Key Elements**:
- `xmlns:th="http://www.thymeleaf.org"`: Enables Thymeleaf attributes.
- `th:each="article : ${articles}"`: Iterates over articles list.
- `th:href="@{/article/{id}(id=${article.id})}"`: Generates URLs with path variables.
- `th:text`: Displays dynamic text.

**Logic**: Template engine processes Thymeleaf expressions, replacing with actual data. Bootstrap provides styling. Shows article previews with links to full views.

### src/main/resources/templates/article.html

**Purpose**: Template for viewing a single article.

**Key Elements**:
- `th:text="${article.title}"`: Displays article title.
- `th:text="${article.content}"`: Shows full content.

**Logic**: Simple display template. In a real app, you'd add formatting, reading time, etc.

### src/main/resources/templates/new-article.html

**Purpose**: Form template for creating new articles.

**Key Elements**:
- `th:action="@{/new}"`: Form submits to POST /new.
- `th:object="${article}"`: Binds form to Article model.
- `th:field="*{title}"`: Binds input to Article.title.

**Logic**: Thymeleaf handles form binding. On submit, data maps to Article object and saves via controller.

## Build and Run Process

1. **Maven Resolution**: Downloads dependencies defined in pom.xml.
2. **Compilation**: Compiles Java sources to bytecode.
3. **Spring Boot Startup**:
   - Scans components, creates beans.
   - Initializes H2 database, creates tables via JPA.
   - Starts embedded Tomcat on port 8080.
4. **Request Handling**: Tomcat routes requests to controller methods.
5. **View Rendering**: Thymeleaf processes templates with model data.

## Database Schema

H2 automatically creates table:
```sql
CREATE TABLE article (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    content CLOB,
    author VARCHAR(255)
);
```

## Security Considerations

This POC has no authentication/authorization. In production, add Spring Security for user management.

## Performance Notes

- H2 is in-memory: Fast but data lost on restart.
- Thymeleaf caching disabled: Slower in production.
- No pagination: `findAll()` loads all articles.

## Extension Ideas

- Add User entity and authentication.
- Implement comments with relationships.
- Add search/filtering.
- Use persistent database (PostgreSQL).
- Add file uploads for images.
- Implement REST API endpoints.