const core = require('@actions/core')
const {Octokit} = require("@octokit/rest")
const {retry} = require("@octokit/plugin-retry");
const {throttling} = require("@octokit/plugin-throttling");

const _Octokit = Octokit.plugin(retry, throttling);

(async function main() {
    const org = core.getInput('org', {required: true, trimWhitespace: true})
    const repo = core.getInput('repo', {required: true, trimWhitespace: true})
    const workflowID = core.getInput('workflow_id', {required: true, trimWhitespace: true})
    const sha = core.getInput('sha', {required: true, trimWhitespace: true})
    const token = core.getInput('token', {required: true, trimWhitespace: true})
    const name = core.getInput('job_name', {required: true, trimWhitespace: true})
    const client = new _Octokit({
        auth: token,
        request: {
            retries: 100
        },
        throttle: {
            onRateLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                if (options.request.retryCount === 0) {
                    octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
            },
            onAbuseLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`);
            },
        }
    });
    const runs = await client.paginate(client.actions.listWorkflowRuns, {
        owner: org,
        repo: repo,
        workflow_id: workflowID,
    })
    for (const run of runs) {
        if (run.head_sha === sha) {
            core.info(`Found matching sha: ${sha}`)
            const jobs = await client.paginate(client.actions.listJobsForWorkflowRun,{
                owner: org,
                repo: repo,
                run_id: run.id,
                per_page: 100
            })
            core.info(`Searching for job: ${name}`)
            for(const job of jobs) {
                console.log(job)
                if(job.name === name) {
                    core.info('Found job')
                    core.setOutput('job-id', job.id)
                    return
                }
            }
            core.setFailed(`No matching job found`)
            return
        }
        core.setFailed(`No matching SHA found`)
        process.exit(1)
    }
})()
