FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /src/target/ugcs-bridge-0.1.0.jar /app/ugcs-bridge.jar
EXPOSE 8092
ENTRYPOINT ["java", "-jar", "/app/ugcs-bridge.jar"]
