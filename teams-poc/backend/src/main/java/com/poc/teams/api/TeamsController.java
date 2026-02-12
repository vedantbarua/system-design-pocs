package com.poc.teams.api;

import com.poc.teams.model.Assignment;
import com.poc.teams.model.Member;
import com.poc.teams.model.Project;
import com.poc.teams.model.Team;
import com.poc.teams.service.TeamService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class TeamsController {
  private final TeamService teamService;

  public TeamsController(TeamService teamService) {
    this.teamService = teamService;
  }

  @GetMapping("/teams")
  public List<Team> listTeams() {
    return teamService.listTeams();
  }

  @PostMapping("/teams")
  public Team createTeam(@Valid @RequestBody CreateTeamRequest request) {
    return teamService.createTeam(request);
  }

  @GetMapping("/teams/{teamId}")
  public Team getTeam(@PathVariable String teamId) {
    return teamService.getTeam(teamId);
  }

  @PostMapping("/teams/{teamId}/members")
  public Member addMember(@PathVariable String teamId, @Valid @RequestBody CreateMemberRequest request) {
    return teamService.addMember(teamId, request);
  }

  @PutMapping("/teams/{teamId}/members/{memberId}")
  public Member updateMember(
      @PathVariable String teamId,
      @PathVariable String memberId,
      @RequestBody UpdateMemberRequest request
  ) {
    return teamService.updateMember(teamId, memberId, request);
  }

  @PostMapping("/teams/{teamId}/projects")
  public Project addProject(@PathVariable String teamId, @Valid @RequestBody CreateProjectRequest request) {
    return teamService.addProject(teamId, request);
  }

  @PostMapping("/teams/{teamId}/assignments")
  public Assignment addAssignment(@PathVariable String teamId, @Valid @RequestBody CreateAssignmentRequest request) {
    return teamService.addAssignment(teamId, request);
  }

  @GetMapping("/teams/{teamId}/dashboard")
  public TeamDashboardResponse getDashboard(@PathVariable String teamId) {
    return teamService.getDashboard(teamId);
  }

  @ExceptionHandler(IllegalArgumentException.class)
  @ResponseStatus(HttpStatus.BAD_REQUEST)
  public String handleIllegalArgument(IllegalArgumentException ex) {
    return ex.getMessage();
  }
}
