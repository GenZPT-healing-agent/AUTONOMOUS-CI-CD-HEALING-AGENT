const normalize = (value) => value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase();
export const generateBranchName = (teamName, leaderName) => {
    const team = normalize(teamName);
    const leader = normalize(leaderName);
    return `${team}_${leader}_AI_Fix`;
};
//# sourceMappingURL=branch.js.map