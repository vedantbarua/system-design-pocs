package com.poc.teams.api;

import com.poc.teams.model.Assignment;
import com.poc.teams.model.Member;
import com.poc.teams.model.Project;
import com.poc.teams.model.Team;
import java.util.List;

public class TeamDashboardResponse {
  private Team team;
  private List<Member> members;
  private List<Project> projects;
  private List<Assignment> assignments;
  private TeamMetrics metrics;

  public TeamDashboardResponse(Team team, List<Member> members, List<Project> projects, List<Assignment> assignments, TeamMetrics metrics) {
    this.team = team;
    this.members = members;
    this.projects = projects;
    this.assignments = assignments;
    this.metrics = metrics;
  }

  public Team getTeam() {
    return team;
  }

  public List<Member> getMembers() {
    return members;
  }

  public List<Project> getProjects() {
    return projects;
  }

  public List<Assignment> getAssignments() {
    return assignments;
  }

  public TeamMetrics getMetrics() {
    return metrics;
  }
}
