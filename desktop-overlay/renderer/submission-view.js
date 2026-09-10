(function (root) {
  function describeSubmission(kill, rows) {
    if (!kill.submissionId) return { visibility: 'Local only', review: 'Not submitted', encounterId: null };
    if (!rows) return { visibility: 'Unknown', review: 'Sign in or reconnect to check', encounterId: null };
    var matches = rows.filter(row => row.submission_id === Number(kill.submissionId));
    if (!matches.length) return { visibility: 'Unknown', review: 'Unavailable for this account', encounterId: null };
    var submission = matches[0];
    var review = { verified: 'Verified', pending_review: 'Pending review', flagged: 'Flagged', removed: 'Removed', streaming: 'Uploading' };
    var start = Number(kill.startTime);
    var encounter = matches.find(row => Date.parse(row.start_time) === start);
    if (!encounter) {
      // The server parses timezone-free log clocks in UTC; the desktop uses local time.
      var serverStart = start - new Date(start).getTimezoneOffset() * 60000;
      var clockMatches = matches.filter(row => Date.parse(row.start_time) === serverStart);
      if (clockMatches.length === 1) encounter = clockMatches[0];
    }
    if (!encounter && matches.length === 1) encounter = matches[0];
    var id = encounter && encounter.encounter_id;
    return {
      visibility: submission.visibility === 'public' ? 'Public' : submission.visibility === 'private' ? 'Private' : 'Unknown',
      review: review[submission.status] || 'Unknown',
      encounterId: submission.visibility === 'public' && submission.status === 'verified' && Number.isSafeInteger(id) && id > 0 ? id : null
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { describeSubmission };
  else root.SubmissionView = { describeSubmission };
})(typeof window !== 'undefined' ? window : globalThis);
