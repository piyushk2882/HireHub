
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

                    curl -fsS http://127.0.0.1:5000/api/health

                    echo "Checking backend API..."

                    for i in 1 2 3 4 5; do
                        if curl -fsS http://127.0.0.1:5000/api/health; then
                            echo ""
                            echo "API health check passed"
                            exit 0
                        fi

                        echo "Waiting for backend..."
                        sleep 3
                    done

                    echo "ERROR: Backend health check failed"
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
