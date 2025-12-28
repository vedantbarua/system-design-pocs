# Medium POC

A simple Proof of Concept (POC) for a Medium-like blogging platform built with Spring Boot, Java, H2 database, and Thymeleaf for templating.

## Features

- View list of articles on the home page
- Read individual articles
- Create new articles
- In-memory H2 database (data resets on restart)

## Quick Start

1. Ensure you have Java 17+ and Maven installed.
2. Navigate to the project directory: `cd medium-poc`
3. Run: `mvn org.springframework.boot:spring-boot-maven-plugin:run`
4. Open `http://localhost:8080` in your browser

## Endpoints

- `/` - Home page with article list
- `/article/{id}` - View article
- `/new` - Create new article
- `/h2-console` - Database console

## Technologies

- Spring Boot 3.2.0
- Java 17
- H2 Database
- Thymeleaf
- Bootstrap

## Hosting

Local: Run as above. For cloud: Build JAR with `mvn clean package`, deploy to Railway/Render/Fly.io.

See TECHNICAL_README.md for detailed explanations.