package com.poc.teams.service;

import com.poc.teams.api.CreateAssignmentRequest;
import com.poc.teams.api.CreateMemberRequest;
import com.poc.teams.api.CreateProjectRequest;
import com.poc.teams.api.CreateTeamRequest;
import com.poc.teams.api.TeamDashboardResponse;
import com.poc.teams.api.TeamMetrics;
import com.poc.teams.api.UpdateMemberRequest;
import com.poc.teams.model.Assignment;
import com.poc.teams.model.Member;
import com.poc.teams.model.MemberStatus;
import com.poc.teams.model.Project;
import com.poc.teams.model.ProjectStatus;
import com.poc.teams.model.Team;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class TeamService {
  private static final int MAX_ASSIGNMENT_UTILIZATION = 120;
  private final Map<String, Team> teams = new HashMap<>();

  public TeamService() {
    seed();
  }

  public List<Team> listTeams() {
    return teams.values().stream()
        .sorted(Comparator.comparing(Team::getCreatedAt))
        .collect(Collectors.toList());
  }

  public Team createTeam(CreateTeamRequest request) {
    String id = UUID.randomUUID().toString();
    Team team = new Team(id, request.getName(), request.getMission(), request.getCapacity(), Instant.now());
    teams.put(id, team);
    return team;
  }

  public Team getTeam(String teamId) {
    Team team = teams.get(teamId);
    if (team == null) {
      throw new IllegalArgumentException("Team not found");
    }
    return team;
  }

  public Member addMember(String teamId, CreateMemberRequest request) {
    Team team = getTeam(teamId);
    if (team.getMembers().size() >= team.getCapacity()) {
      throw new IllegalArgumentException("Team capacity reached");
    }
    Member member = new Member(
        UUID.randomUUID().toString(),
        request.getName(),
        request.getRole(),
        request.getLocation(),
        MemberStatus.ACTIVE,
        request.getSkills(),
        Instant.now()
    );
    team.getMembers().add(member);
    return member;
  }

  public Member updateMember(String teamId, String memberId, UpdateMemberRequest request) {
    Team team = getTeam(teamId);
    Member member = team.getMembers().stream()
        .filter(item -> item.getId().equals(memberId))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Member not found"));
    if (request.getRole() != null && !request.getRole().isBlank()) {
      member.setRole(request.getRole());
    }
    if (request.getLocation() != null) {
      member.setLocation(request.getLocation());
    }
    if (request.getStatus() != null) {
      member.setStatus(request.getStatus());
    }
    return member;
  }

  public Project addProject(String teamId, CreateProjectRequest request) {
    Team team = getTeam(teamId);
    Project project = new Project(
        UUID.randomUUID().toString(),
        request.getName(),
        request.getGoal(),
        request.getStatus() == null ? ProjectStatus.PLANNING : request.getStatus(),
        Instant.now()
    );
    team.getProjects().add(project);
    return project;
  }

  public Assignment addAssignment(String teamId, CreateAssignmentRequest request) {
    Team team = getTeam(teamId);
    Member member = team.getMembers().stream()
        .filter(item -> item.getId().equals(request.getMemberId()))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Member not found"));
    Project project = team.getProjects().stream()
        .filter(item -> item.getId().equals(request.getProjectId()))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Project not found"));
    int currentUtilization = team.getAssignments().stream()
        .filter(item -> item.getMemberId().equals(member.getId()))
        .mapToInt(Assignment::getAllocationPercent)
        .sum();
    if (currentUtilization + request.getAllocationPercent() > MAX_ASSIGNMENT_UTILIZATION) {
      throw new IllegalArgumentException("Member utilization would exceed " + MAX_ASSIGNMENT_UTILIZATION + "%");
    }
    Assignment assignment = new Assignment(
        UUID.randomUUID().toString(),
        member.getId(),
        project.getId(),
        request.getAllocationPercent(),
        Instant.now()
    );
    team.getAssignments().add(assignment);
    return assignment;
  }

  public TeamDashboardResponse getDashboard(String teamId) {
    Team team = getTeam(teamId);
    int headcount = team.getMembers().size();
    int totalProjects = team.getProjects().size();
    int activeProjects = (int) team.getProjects().stream()
        .filter(project -> project.getStatus() == ProjectStatus.ACTIVE || project.getStatus() == ProjectStatus.AT_RISK)
        .count();
    int totalAssignments = team.getAssignments().size();
    double averageUtilization = 0;
    if (headcount > 0) {
      int totalUtilization = 0;
      for (Member member : team.getMembers()) {
        int utilization = team.getAssignments().stream()
            .filter(item -> item.getMemberId().equals(member.getId()))
            .mapToInt(Assignment::getAllocationPercent)
            .sum();
        totalUtilization += utilization;
      }
      averageUtilization = Math.round((totalUtilization / (double) headcount) * 10.0) / 10.0;
    }
    TeamMetrics metrics = new TeamMetrics(headcount, activeProjects, totalProjects, totalAssignments, averageUtilization);
    return new TeamDashboardResponse(
        team,
        new ArrayList<>(team.getMembers()),
        new ArrayList<>(team.getProjects()),
        new ArrayList<>(team.getAssignments()),
        metrics
    );
  }

  private void seed() {
    Team team = new Team(UUID.randomUUID().toString(), "Atlas", "Owns platform reliability", 8, Instant.now());
    teams.put(team.getId(), team);

    Member member1 = new Member(UUID.randomUUID().toString(), "Riya Patel", "Tech Lead", "Toronto", MemberStatus.ACTIVE,
        List.of("Reliability", "Incident Response"), Instant.now());
    Member member2 = new Member(UUID.randomUUID().toString(), "Marco Silva", "SRE", "Lisbon", MemberStatus.ACTIVE,
        List.of("Kubernetes", "Observability"), Instant.now());
    team.getMembers().add(member1);
    team.getMembers().add(member2);

    Project project1 = new Project(UUID.randomUUID().toString(), "Latency Drop", "Reduce p99 latency by 20%", ProjectStatus.ACTIVE, Instant.now());
    Project project2 = new Project(UUID.randomUUID().toString(), "On-call Revamp", "Improve alert quality", ProjectStatus.AT_RISK, Instant.now());
    team.getProjects().add(project1);
    team.getProjects().add(project2);

    team.getAssignments().add(new Assignment(UUID.randomUUID().toString(), member1.getId(), project1.getId(), 60, Instant.now()));
    team.getAssignments().add(new Assignment(UUID.randomUUID().toString(), member2.getId(), project2.getId(), 70, Instant.now()));
  }
}
