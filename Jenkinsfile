
pipeline {
    agent any

    tools {
        nodejs 'node20'
    }

    options {
        skipDefaultCheckout(true)
        timestamps()
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // FRONTEND

        stage('Frontend - Install Dependencies') {
            steps {
                dir('client') {
                    sh 'npm ci'
                }
            }
        }

        stage('Frontend - Build') {
            environment {
                NODE_OPTIONS = '--max-old-space-size=1024'
            }
            steps {
                dir('client') {
                    sh 'npm run build -- --configuration production'
                }
            }
        }

        // BACKEND

        stage('Backend - Install Dependencies') {
            steps {
                dir('server') {
                    sh 'npm ci'
                }
            }
        }

        stage('Backend - Test') {
            steps {
                dir('server') {
                    sh 'npm test --if-present'
                }
            }
        }

        // DEPLOY FRONTEND

        stage('Deploy Frontend') {
            steps {
                sh '''
                    set -e

                    OUT=$(dirname "$(find client/dist -type f -name index.html -print -quit)")

                    if [ -z "$OUT" ] || [ ! -f "$OUT/index.html" ]; then
                        echo "ERROR: Angular build output not found"
                        exit 1
                    fi

                    echo "Deploying frontend from: $OUT"

                    sudo rsync -a --delete "$OUT"/ /var/www/angular-app/

                    echo "Frontend deployment completed"
                '''
            }
        }

        // DEPLOY BACKEND

        stage('Deploy Backend') {
            steps {
                sh '''
                    set -e

                    echo "Deploying backend..."

                    sudo rsync -a --delete \
                        --exclude='node_modules/' \
                        --exclude='.env' \
                        --exclude='.git/' \
                        server/ /opt/hirehub/server/

                    sudo chown -R hirehub:hirehub /opt/hirehub/server

                    echo "Installing production dependencies..."

                    sudo -u hirehub -H sh -c \
                        'cd /opt/hirehub/server && npm ci --omit=dev'

                    echo "Restarting HireHub backend..."

                    sudo systemctl restart hirehub-backend

                    echo "Backend deployment completed"
                '''
            }
        }

        // VERIFY DEPLOYMENT

        stage('Verify Deployment') {
            steps {
                sh '''
                    set -e

                    echo "Checking backend service..."

                    sudo systemctl is-active --quiet hirehub-backend

                    echo "Checking API health..."

                    for i in 1 2 3 4 5; do
                        if curl -fsS http://127.0.0.1:5000/api/health; then
                            echo "API health check passed"
                            exit 0
                        fi

                        echo "API not ready yet. Retrying..."
                        sleep 3
                    done

                    echo "ERROR: API health check failed"
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            echo 'HireHub frontend and backend deployed successfully!'
        }

        failure {
            echo 'HireHub pipeline failed. Check the stage logs.'
        }
    }
}
