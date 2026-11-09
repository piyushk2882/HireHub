
pipeline {
    agent any

    tools {
        nodejs 'node20'
    }

    options {
        skipDefaultCheckout(true)
        timestamps()
    }

    triggers {
        pollSCM('H/2 * * * *')
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // FRONTEND BUILD

        stage('Frontend - Install Dependencies') {
            steps {
                dir('client') {
                    sh 'npm ci'
                }
            }
        }

        stage('Frontend - Production Build') {
            environment {
                NODE_OPTIONS = '--max-old-space-size=1024'
            }
            steps {
                dir('client') {
                    sh 'npm run build -- --configuration production'
                }
            }
        }

        // BACKEND BUILD

        stage('Backend - Install Dependencies') {
            steps {
                dir('server') {
                    sh 'npm ci'
                }
            }
        }

        stage('Backend - Build Verification') {
            steps {
                dir('server') {
                    sh '''
                        node --check src/server.js
                        echo "Backend syntax verification successful"
                    '''
                }
            }
        }

        // FRONTEND DEPLOYMENT

        stage('Deploy Frontend') {
            steps {
        sh 'sudo /usr/local/sbin/deploy-hirehub-frontend'   
    }
        }

        // BACKEND DEPLOYMENT

        stage('Deploy Backend') {
            steps {
        sh 'sudo /usr/local/sbin/deploy-hirehub-backend'
    }
        }

        // DEPLOYMENT VERIFICATION

       stage('Verify Deployment') {
    steps {
        sh '''
            set -e

            echo "Checking backend service..."

            for i in 1 2 3 4 5 6 7 8 9 10; do

                if curl -fsS http://127.0.0.1:5000/api/health; then
                    echo ""
                    echo "SUCCESS: Backend API is responding!"
                    exit 0
                fi

                echo "Attempt $i: Backend not ready yet. Waiting 3 seconds..."
                sleep 3

            done

            echo "ERROR: Backend health check failed"

            sudo systemctl status hirehub-backend --no-pager || true
            sudo journalctl -u hirehub-backend -n 40 --no-pager || true

            exit 1
        '''
    }
}
    }

    post {
        success {
            echo 'SUCCESS: HireHub frontend and backend deployed!'
        }

        failure {
            echo 'FAILED: Check the Jenkins console output.'
        }
    }
}
