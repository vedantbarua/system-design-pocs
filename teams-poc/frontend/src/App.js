import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8105/api";

const emptyForm = {
  teamName: "",
  teamMission: "",
  teamCapacity: 6,
  memberName: "",
  memberRole: "",
  memberLocation: "",
  memberSkills: "",
  projectName: "",
  projectGoal: "",
  projectStatus: "PLANNING",
  assignmentMemberId: "",
  assignmentProjectId: "",
  assignmentAllocation: 25
};

export default function App() {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId),
    [teams, selectedTeamId]
  );

  const loadTeams = async () => {
    const res = await fetch(`${API_BASE}/teams`);
    const data = await res.json();
    setTeams(data);
    if (data.length > 0 && !selectedTeamId) {
      setSelectedTeamId(data[0].id);
    }
  };

  const loadDashboard = async (teamId) => {
    if (!teamId) return;
    const res = await fetch(`${API_BASE}/teams/${teamId}/dashboard`);
    const data = await res.json();
    setDashboard(data);
  };

  useEffect(() => {
    loadTeams().catch(() => setError("Failed to load teams"));
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    loadDashboard(selectedTeamId).catch(() => setError("Failed to load dashboard"));
  }, [selectedTeamId]);

  const updateForm = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateTeam = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.teamName,
          mission: form.teamMission,
          capacity: Number(form.teamCapacity)
        })
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const created = await res.json();
      await loadTeams();
      setSelectedTeamId(created.id);
      setForm((prev) => ({ ...prev, teamName: "", teamMission: "", teamCapacity: 6 }));
    } catch (err) {
      setError(err.message || "Failed to create team");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (event) => {
    event.preventDefault();
    if (!selectedTeamId) return;
    setError("");
    try {
      const payload = {
        name: form.memberName,
        role: form.memberRole,
        location: form.memberLocation || null,
        skills: form.memberSkills
          ? form.memberSkills.split(",").map((skill) => skill.trim()).filter(Boolean)
          : []
      };
      const res = await fetch(`${API_BASE}/teams/${selectedTeamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      await loadDashboard(selectedTeamId);
      setForm((prev) => ({ ...prev, memberName: "", memberRole: "", memberLocation: "", memberSkills: "" }));
    } catch (err) {
      setError(err.message || "Failed to add member");
    }
  };

  const handleAddProject = async (event) => {
    event.preventDefault();
    if (!selectedTeamId) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/teams/${selectedTeamId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.projectName,
          goal: form.projectGoal,
          status: form.projectStatus
        })
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      await loadDashboard(selectedTeamId);
      setForm((prev) => ({ ...prev, projectName: "", projectGoal: "", projectStatus: "PLANNING" }));
    } catch (err) {
      setError(err.message || "Failed to add project");
    }
  };

  const handleAddAssignment = async (event) => {
    event.preventDefault();
    if (!selectedTeamId) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/teams/${selectedTeamId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: form.assignmentMemberId,
          projectId: form.assignmentProjectId,
          allocationPercent: Number(form.assignmentAllocation)
        })
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      await loadDashboard(selectedTeamId);
      setForm((prev) => ({ ...prev, assignmentAllocation: 25 }));
    } catch (err) {
      setError(err.message || "Failed to add assignment");
    }
  };

  useEffect(() => {
    if (!dashboard) return;
    const members = dashboard.members || [];
    const projects = dashboard.projects || [];
    if (!form.assignmentMemberId && members.length > 0) {
      setForm((prev) => ({ ...prev, assignmentMemberId: members[0].id }));
    }
    if (!form.assignmentProjectId && projects.length > 0) {
      setForm((prev) => ({ ...prev, assignmentProjectId: projects[0].id }));
    }
  }, [dashboard]);

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Teams POC</p>
          <h1>Team Capacity & Project Allocation</h1>
          <p className="subtitle">Track teams, members, and how work is distributed across projects.</p>
        </div>
        <div className="team-select">
          <label>Active Team</label>
          <select
            value={selectedTeamId}
            onChange={(event) => setSelectedTeamId(event.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="grid">
        <div className="card">
          <h2>Create Team</h2>
          <form onSubmit={handleCreateTeam}>
            <input
              placeholder="Team name"
              value={form.teamName}
              onChange={updateForm("teamName")}
              required
            />
            <input
              placeholder="Mission"
              value={form.teamMission}
              onChange={updateForm("teamMission")}
            />
            <input
              type="number"
              min="1"
              max="200"
              placeholder="Capacity"
              value={form.teamCapacity}
              onChange={updateForm("teamCapacity")}
            />
            <button type="submit" disabled={loading}>Create</button>
          </form>
        </div>

        <div className="card">
          <h2>Team Metrics</h2>
          {dashboard ? (
            <div className="metrics">
              <div>
                <span>Headcount</span>
                <strong>{dashboard.metrics.headcount}</strong>
              </div>
              <div>
                <span>Active Projects</span>
                <strong>{dashboard.metrics.activeProjects}</strong>
              </div>
              <div>
                <span>Total Projects</span>
                <strong>{dashboard.metrics.totalProjects}</strong>
              </div>
              <div>
                <span>Assignments</span>
                <strong>{dashboard.metrics.totalAssignments}</strong>
              </div>
              <div>
                <span>Avg Utilization</span>
                <strong>{dashboard.metrics.averageUtilization}%</strong>
              </div>
            </div>
          ) : (
            <p className="muted">Select a team to view metrics.</p>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Add Member</h2>
          <form onSubmit={handleAddMember}>
            <input
              placeholder="Name"
              value={form.memberName}
              onChange={updateForm("memberName")}
              required
            />
            <input
              placeholder="Role"
              value={form.memberRole}
              onChange={updateForm("memberRole")}
              required
            />
            <input
              placeholder="Location"
              value={form.memberLocation}
              onChange={updateForm("memberLocation")}
            />
            <input
              placeholder="Skills (comma separated)"
              value={form.memberSkills}
              onChange={updateForm("memberSkills")}
            />
            <button type="submit">Add</button>
          </form>
        </div>

        <div className="card">
          <h2>Add Project</h2>
          <form onSubmit={handleAddProject}>
            <input
              placeholder="Project name"
              value={form.projectName}
              onChange={updateForm("projectName")}
              required
            />
            <input
              placeholder="Goal"
              value={form.projectGoal}
              onChange={updateForm("projectGoal")}
            />
            <select value={form.projectStatus} onChange={updateForm("projectStatus")}>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="AT_RISK">At Risk</option>
              <option value="COMPLETE">Complete</option>
            </select>
            <button type="submit">Add</button>
          </form>
        </div>

        <div className="card">
          <h2>Add Assignment</h2>
          <form onSubmit={handleAddAssignment}>
            <select
              value={form.assignmentMemberId}
              onChange={updateForm("assignmentMemberId")}
              required
            >
              <option value="">Select member</option>
              {dashboard?.members?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <select
              value={form.assignmentProjectId}
              onChange={updateForm("assignmentProjectId")}
              required
            >
              <option value="">Select project</option>
              {dashboard?.projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="5"
              max="100"
              value={form.assignmentAllocation}
              onChange={updateForm("assignmentAllocation")}
            />
            <button type="submit">Assign</button>
          </form>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Members</h2>
          {dashboard?.members?.length ? (
            <ul className="list">
              {dashboard.members.map((member) => (
                <li key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.role}</span>
                  </div>
                  <div>
                    <span>{member.status}</span>
                    <span className="muted">{member.location || "Remote"}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No members yet.</p>
          )}
        </div>

        <div className="card">
          <h2>Projects</h2>
          {dashboard?.projects?.length ? (
            <ul className="list">
              {dashboard.projects.map((project) => (
                <li key={project.id}>
                  <div>
                    <strong>{project.name}</strong>
                    <span>{project.goal || "No goal provided"}</span>
                  </div>
                  <div>
                    <span className={`status status-${project.status.toLowerCase()}`}>{project.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No projects yet.</p>
          )}
        </div>

        <div className="card">
          <h2>Assignments</h2>
          {dashboard?.assignments?.length ? (
            <ul className="list">
              {dashboard.assignments.map((assignment) => {
                const member = dashboard.members.find((m) => m.id === assignment.memberId);
                const project = dashboard.projects.find((p) => p.id === assignment.projectId);
                return (
                  <li key={assignment.id}>
                    <div>
                      <strong>{member ? member.name : "Member"}</strong>
                      <span>{project ? project.name : "Project"}</span>
                    </div>
                    <div>
                      <span>{assignment.allocationPercent}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">No assignments yet.</p>
          )}
        </div>
      </section>

      <footer className="footer">
        <p>
          {selectedTeam ? `${selectedTeam.name}: ${selectedTeam.mission || "No mission set"}` : ""}
        </p>
      </footer>
    </div>
  );
}
