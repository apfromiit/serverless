'use strict'

const chai = require('chai')
const sandbox = require('sinon')
const { constants } = require('fs')
const fs = require('fs')
const fsp = require('fs').promises
const fse = require('fs-extra')
const os = require('os')
const path = require('path')
const AwsConfigCredentials = require('../../../../../lib/plugins/aws/config-credentials')
const Serverless = require('../../../../../lib/serverless')
const runServerless = require('../../../../utils/run-serverless')

const { expect } = chai
chai.use(require('chai-as-promised'))

describe('AwsConfigCredentials', () => {
  let awsConfigCredentials
  let serverless
  const homeDirPath = os.homedir()
  const awsDirectoryPath = path.join(homeDirPath, '.aws')
  const credentialsFilePath = path.join(awsDirectoryPath, 'credentials')
  const credentialsFileContent = [
    '[my-profile]',
    'aws_access_key_id = my-old-profile-key',
    'aws_secret_access_key = my-old-profile-secret',
  ].join('\n')

  before(async () => {
    // Abort if credentials are found in home directory
    // (it should not be the case, as home directory is mocked to point temp dir)
    return fsp.lstat(awsDirectoryPath).then(
      () => {
        throw new Error('Unexpected ~/.aws directory, related tests aborted')
      },
      (error) => {
        if (error.code === 'ENOENT') return
        throw error
      },
    )
  })

  beforeEach(async () => {
    serverless = new Serverless({
      commands: ['print'],
      options: {},
      serviceDir: null,
    })
    return serverless.init().then(() => {
      const options = {
        provider: 'aws',
        key: 'some-key',
        secret: 'some-secret',
      }
      awsConfigCredentials = new AwsConfigCredentials(serverless, options)
    })
  })

  afterEach(() => fse.remove(awsDirectoryPath))

  describe('#constructor()', () => {
    it('should have the command "config"', () => {
      expect(awsConfigCredentials.commands.config).to.not.equal(undefined)
    })

    it('should have the sub-command "credentials"', () => {
      expect(
        awsConfigCredentials.commands.config.commands.credentials,
      ).to.not.equal(undefined)
    })

    it('should have no lifecycle event', () => {
      expect(awsConfigCredentials.commands.config.lifecycleEvents).to.equal(
        undefined,
      )
    })

    it('should have the lifecycle event "config" for the "credentials" sub-command', () => {
      expect(
        awsConfigCredentials.commands.config.commands.credentials
          .lifecycleEvents,
      ).to.deep.equal(['config'])
    })

    it('should have the req. options "key" and "secret" for the "credentials" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(
        awsConfigCredentials.commands.config.commands.credentials.options.key
          .required,
      ).to.be.true
      // eslint-disable-next-line no-unused-expressions
      expect(
        awsConfigCredentials.commands.config.commands.credentials.options.secret
          .required,
      ).to.be.true
    })

    it('should have a "config:credentials:config" hook', () => {
      expect(
        awsConfigCredentials.hooks['config:credentials:config'],
      ).to.not.equal(undefined)
    })

    it('should run promise chain in order for "config:credentials:config" hook', async () => {
      const awsConfigCredentialsStub = sandbox
        .stub(awsConfigCredentials, 'configureCredentials')
        .resolves()

      return awsConfigCredentials.hooks['config:credentials:config']().then(
        () => {
          expect(awsConfigCredentialsStub.calledOnce).to.equal(true)

          awsConfigCredentials.configureCredentials.restore()
        },
      )
    })

    it('should throw an error if the home directory was not found', () => {
      sandbox.stub(os, 'homedir').returns(null)
      try {
        expect(() => new AwsConfigCredentials(serverless, {})).to.throw(Error)
      } finally {
        sandbox.restore()
      }
    })
  })

  describe('#configureCredentials()', () => {
    it('should lowercase the provider option', async () => {
      awsConfigCredentials.options.provider = 'SOMEPROVIDER'

      return awsConfigCredentials.configureCredentials().then(() => {
        expect(awsConfigCredentials.options.provider).to.equal('someprovider')
      })
    })

    it('should use the "default" profile if option is not given', async () =>
      awsConfigCredentials.configureCredentials().then(() => {
        expect(awsConfigCredentials.options.profile).to.equal('default')
      }))

    it('should resolve if the provider option is not "aws"', async () => {
      awsConfigCredentials.options.provider = 'invalid-provider'

      return expect(awsConfigCredentials.configureCredentials()).to.be
        .eventually.fulfilled
    })

    it('should throw an error if the "key" and "secret" options are not given', async () => {
      awsConfigCredentials.options.key = false
      awsConfigCredentials.options.secret = false
      return awsConfigCredentials.configureCredentials().then(
        () => {
          throw new Error('Unexpected')
        },
        (error) =>
          expect(error.message).to.include(
            'Please include --key and --secret options for AWS',
          ),
      )
    })

    it('should update the profile', async () => {
      awsConfigCredentials.options.profile = 'my-profile'
      awsConfigCredentials.options.key = 'my-new-profile-key'
      awsConfigCredentials.options.secret = 'my-new-profile-secret'
      awsConfigCredentials.options.overwrite = true

      fse.outputFileSync(credentialsFilePath, credentialsFileContent)

      return awsConfigCredentials.configureCredentials().then(() => {
        const UpdatedCredentialsFileContent = fs
          .readFileSync(credentialsFilePath)
          .toString()
        const lineByLineContent = UpdatedCredentialsFileContent.split('\n')

        expect(lineByLineContent[0]).to.equal('[my-profile]')
        expect(lineByLineContent[1]).to.equal(
          'aws_access_key_id=my-new-profile-key',
        )
        expect(lineByLineContent[2]).to.equal(
          'aws_secret_access_key=my-new-profile-secret',
        )
      })
    })

    it('should not alter other profiles when updating a profile', async () => {
      awsConfigCredentials.options.profile = 'my-profile'
      awsConfigCredentials.options.key = 'my-new-profile-key'
      awsConfigCredentials.options.secret = 'my-new-profile-secret'
      awsConfigCredentials.options.overwrite = true

      const newCredentialsFileContent = [
        credentialsFileContent,
        '[my-other-profile]',
        'aws_access_key_id = my-other-profile-key',
        'aws_secret_access_key = my-other-profile-secret',
      ].join('\n')

      fse.outputFileSync(credentialsFilePath, newCredentialsFileContent)

      return awsConfigCredentials.configureCredentials().then(() => {
        const UpdatedCredentialsFileContent = fs
          .readFileSync(credentialsFilePath)
          .toString()
        const lineByLineContent = UpdatedCredentialsFileContent.split('\n')

        expect(lineByLineContent[0]).to.equal('[my-profile]')
        expect(lineByLineContent[1]).to.equal(
          'aws_access_key_id=my-new-profile-key',
        )
        expect(lineByLineContent[2]).to.equal(
          'aws_secret_access_key=my-new-profile-secret',
        )
        expect(lineByLineContent[6]).to.equal(
          'aws_secret_access_key=my-other-profile-secret',
        )
      })
    })

    it('should add the missing credentials to the updated profile', async () => {
      const newCredentialsFileContent = [
        credentialsFileContent,
        '[my-profile]',
        'aws_secret_access_key = my-profile-secret',
      ].join('\n')

      awsConfigCredentials.options.profile = 'my-profile'
      awsConfigCredentials.options.key = 'my-new-profile-key'
      awsConfigCredentials.options.secret = 'my-new-profile-secret'
      awsConfigCredentials.options.overwrite = true

      fse.outputFileSync(credentialsFilePath, newCredentialsFileContent)

      return awsConfigCredentials.configureCredentials().then(() => {
        const UpdatedCredentialsFileContent = fs
          .readFileSync(credentialsFilePath)
          .toString()
        const lineByLineContent = UpdatedCredentialsFileContent.split('\n')

        expect(lineByLineContent[0]).to.equal('[my-profile]')
        expect(lineByLineContent[1]).to.equal(
          'aws_access_key_id=my-new-profile-key',
        )
        expect(lineByLineContent[2]).to.equal(
          'aws_secret_access_key=my-new-profile-secret',
        )
      })
    })

    it('should append the profile to the credentials file', async () => {
      awsConfigCredentials.options.profile = 'my-profile'
      awsConfigCredentials.options.key = 'my-profile-key'
      awsConfigCredentials.options.secret = 'my-profile-secret'

      return awsConfigCredentials.configureCredentials().then(() => {
        const UpdatedCredentialsFileContent = fs
          .readFileSync(credentialsFilePath)
          .toString()
        const lineByLineContent = UpdatedCredentialsFileContent.split('\n')

        expect(lineByLineContent[0]).to.equal('[my-profile]')
        expect(lineByLineContent[1]).to.equal(
          'aws_access_key_id=my-profile-key',
        )
        expect(lineByLineContent[2]).to.equal(
          'aws_secret_access_key=my-profile-secret',
        )
      })
    })

    if (os.platform() !== 'win32') {
      it('should set the permissions of the credentials file to be owner-only read/write', async () =>
        awsConfigCredentials.configureCredentials().then(() => {
          const fileMode = fs.statSync(credentialsFilePath).mode
          const filePermissions = fileMode & ~(fs.constants || constants).S_IFMT

          const readableByOwnerPermission = (fs.constants || constants).S_IRUSR
          const writableByOwnerPermission = (fs.constants || constants).S_IWUSR
          const expectedFilePermissions =
            readableByOwnerPermission | writableByOwnerPermission

          expect(filePermissions).to.equal(expectedFilePermissions)
        }))
    }
  })
})

describe('test/unit/lib/plugins/aws/configCredentials.test.js', () => {
  it('should fail if profile is already set and overwrite is not set', async () => {
    const credentialsFilePath = path.join(os.homedir(), '.aws', 'credentials')
    const credentialsFileContent = [
      '[default]',
      'aws_access_key_id = my-old-profile-key',
      'aws_secret_access_key = my-old-profile-secret',
    ].join('\n')

    await fse.outputFile(credentialsFilePath, credentialsFileContent)

    await expect(
      runServerless({
        noService: true,
        command: 'config credentials',
        options: { provider: 'aws', key: 'key', secret: 'secret' },
      }),
    ).to.be.eventually.rejected.and.have.property(
      'code',
      'CREDENTIALS_PROFILE_ALREADY_CONFIGURED',
    )
  })
})
